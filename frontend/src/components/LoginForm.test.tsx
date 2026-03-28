import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";

const mockOnLogin = vi.fn();

beforeEach(() => {
  mockOnLogin.mockClear();
  vi.restoreAllMocks();
});

describe("LoginForm", () => {
  it("renders the login form", () => {
    render(<LoginForm onLogin={mockOnLogin} />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("calls onLogin on successful login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      json: async () => ({ ok: true, username: "user" }),
    } as Response);

    render(<LoginForm onLogin={mockOnLogin} />);
    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(mockOnLogin).toHaveBeenCalledOnce();
  });

  it("shows error on failed login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      json: async () => ({ ok: false, detail: "Invalid credentials" }),
    } as Response);

    render(<LoginForm onLogin={mockOnLogin} />);
    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByTestId("login-error")).toHaveTextContent("Invalid credentials");
    expect(mockOnLogin).not.toHaveBeenCalled();
  });
});
