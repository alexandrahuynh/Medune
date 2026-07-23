// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import Profile from "./Profile";
import { useAuth } from "../auth/authContextValue";
import { getPgxResults } from "../api/pgx";

vi.mock("../auth/authContextValue", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../api/pgx", () => ({
  getPgxResults: vi.fn(),
  savePgxResult: vi.fn(),
}));

describe("Profile", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { firstName: "Jamie", patientId: "patient-1" },
      logout: vi.fn(),
    });
    getPgxResults.mockResolvedValue({ supported: true, results: [] });
  });

  test("renders the PGx profile management experience", async () => {
    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/my pgx profile/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeTruthy();
  });

  test("renders saved gene results with gene as the card header and phenotype/genotype labels", async () => {
    getPgxResults.mockResolvedValue({
      supported: true,
      results: [{ id: "result-1", gene: "CYP2C19", phenotype: "poor metabolizer", genotype: "*1/*2" }],
    });

    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /cyp2c19/i })).toBeTruthy();
    expect(screen.getByText(/phenotype/i)).toBeTruthy();
    expect(screen.getByText(/genotype/i)).toBeTruthy();
  });

  test("lets users edit a saved gene result from the existing profile cards", async () => {
    getPgxResults.mockResolvedValue({
      supported: true,
      results: [{ id: "result-1", gene: "CYP2C19", phenotype: "poor metabolizer", genotype: "*1/*2" }],
    });

    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /edit data/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit cyp2c19/i }));

    const updateButton = await screen.findByRole("button", { name: /update pgx result/i });
    const selectedCard = updateButton.closest(".pgx-result-card");

    expect(selectedCard).not.toBeNull();
    expect(within(selectedCard).getByDisplayValue("CYP2C19")).toBeTruthy();
  });
});
