import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="rounded-xl border border-[var(--primary-blue)]/30 bg-white px-4 py-3.5 shadow-[0_16px_48px_rgba(3,33,71,0.18)]">
    <div>
      <h4 className="font-display text-sm font-bold leading-snug text-[var(--navy-dark)]">
        {card.title}
      </h4>
      {card.details && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--gray-text)]">
          {card.details}
        </p>
      )}
    </div>
  </article>
);
