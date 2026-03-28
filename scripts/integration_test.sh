#!/bin/bash
# Integration tests for Part 6 API
BASE="http://localhost:8000"
PASS=0
FAIL=0

check() {
    local desc="$1" expected="$2" actual="$3"
    if [[ "$actual" == *"$expected"* ]]; then
        echo "PASS: $desc"
        ((PASS++))
    else
        echo "FAIL: $desc (expected '$expected', got '$actual')"
        ((FAIL++))
    fi
}

# 1. Health
R=$(curl -s $BASE/api/health)
check "Health endpoint" '"status":"ok"' "$R"

# 2. Login
R=$(curl -s -c /tmp/cookies.txt $BASE/api/login -H 'Content-Type: application/json' -d '{"username":"user","password":"password"}')
check "Login success" '"ok":true' "$R"
COOKIE=$(grep session /tmp/cookies.txt | awk '{print $NF}')

# 3. Get board
R=$(curl -s -b "session=$COOKIE" $BASE/api/board)
check "Board name" '"My Board"' "$R"
check "Board has 5 columns" '"Done"' "$R"
check "Board has seed cards" '"Align roadmap themes"' "$R"

# 4. Auth required (no cookie)
R=$(curl -s $BASE/api/board)
check "Board requires auth" '"Not authenticated"' "$R"

R=$(curl -s -X PUT $BASE/api/columns/1 -H 'Content-Type: application/json' -d '{"title":"X"}')
check "Rename requires auth" '"Not authenticated"' "$R"

R=$(curl -s -X POST $BASE/api/cards -H 'Content-Type: application/json' -d '{"column_id":1,"title":"X"}')
check "Create requires auth" '"Not authenticated"' "$R"

R=$(curl -s -X DELETE $BASE/api/cards/1)
check "Delete requires auth" '"Not authenticated"' "$R"

R=$(curl -s -X PUT $BASE/api/cards/1/move -H 'Content-Type: application/json' -d '{"column_id":2,"position":0}')
check "Move requires auth" '"Not authenticated"' "$R"

# 5. Create card
R=$(curl -s -b "session=$COOKIE" -X POST $BASE/api/cards -H 'Content-Type: application/json' -d '{"column_id":1,"title":"Test card","details":"Created via integration test"}')
check "Create card" '"Test card"' "$R"
check "Create card position" '"position":2' "$R"
NEW_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 6. Update card
R=$(curl -s -b "session=$COOKIE" -X PUT $BASE/api/cards/$NEW_ID -H 'Content-Type: application/json' -d '{"title":"Updated card"}')
check "Update card" '"ok":true' "$R"

# 7. Verify update persisted
R=$(curl -s -b "session=$COOKIE" $BASE/api/board)
check "Update persisted" '"Updated card"' "$R"

# 8. Move card to Discovery (column 2)
R=$(curl -s -b "session=$COOKIE" -X PUT $BASE/api/cards/$NEW_ID/move -H 'Content-Type: application/json' -d '{"column_id":2,"position":0}')
check "Move card" '"ok":true' "$R"

# 9. Verify move
R=$(curl -s -b "session=$COOKIE" $BASE/api/board)
DISC_CARDS=$(echo "$R" | python3 -c "import sys,json; b=json.load(sys.stdin); print(len(b['columns'][1]['cards']))")
check "Discovery has 2 cards after move" "2" "$DISC_CARDS"

# 10. Rename column
R=$(curl -s -b "session=$COOKIE" -X PUT $BASE/api/columns/1 -H 'Content-Type: application/json' -d '{"title":"Renamed Backlog"}')
check "Rename column" '"ok":true' "$R"

R=$(curl -s -b "session=$COOKIE" $BASE/api/board)
check "Rename persisted" '"Renamed Backlog"' "$R"

# 11. Delete card
R=$(curl -s -b "session=$COOKIE" -X DELETE $BASE/api/cards/$NEW_ID)
check "Delete card" '"ok":true' "$R"

R=$(curl -s -b "session=$COOKIE" $BASE/api/board)
DISC_CARDS=$(echo "$R" | python3 -c "import sys,json; b=json.load(sys.stdin); print(len(b['columns'][1]['cards']))")
check "Discovery has 1 card after delete" "1" "$DISC_CARDS"

# 12. Not found cases
R=$(curl -s -o /dev/null -w "%{http_code}" -b "session=$COOKIE" -X PUT $BASE/api/columns/999 -H 'Content-Type: application/json' -d '{"title":"X"}')
check "Rename nonexistent column -> 404" "404" "$R"

R=$(curl -s -o /dev/null -w "%{http_code}" -b "session=$COOKIE" -X DELETE $BASE/api/cards/999)
check "Delete nonexistent card -> 404" "404" "$R"

# 13. DB persistence across restart
docker restart kanban-studio > /dev/null 2>&1
sleep 3
R=$(curl -s -b "session=$COOKIE" $BASE/api/health)
check "Health after restart" '"status":"ok"' "$R"

# New login since sessions are in-memory
R=$(curl -s -c /tmp/cookies2.txt $BASE/api/login -H 'Content-Type: application/json' -d '{"username":"user","password":"password"}')
COOKIE2=$(grep session /tmp/cookies2.txt | awk '{print $NF}')
R=$(curl -s -b "session=$COOKIE2" $BASE/api/board)
check "Board persists after restart" '"Renamed Backlog"' "$R"

echo ""
echo "Results: $PASS passed, $FAIL failed"
rm -f /tmp/cookies.txt /tmp/cookies2.txt
