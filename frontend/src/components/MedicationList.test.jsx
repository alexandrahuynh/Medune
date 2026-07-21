// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import MedicationList from "./MedicationList";

const api = vi.hoisted(() => ({
  add: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  search: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../api/medications", () => ({
  addPatientMedication: api.add,
  getPatientMedications: api.get,
  removePatientMedication: api.remove,
  searchMedications: api.search,
  updatePatientMedication: api.update,
}));

function medication(id = "list-1", medicationId = "med-1", name = "clopidogrel") {
  return {
    id,
    medicationId,
    genericName: name,
    brandName: name === "clopidogrel" ? "Plavix" : "Zocor",
    drugClass: "test class",
    status: "active",
    notes: "",
    safety: {
      forms: ["oral tablet"],
      dosageInformation: "Dose is not stored.",
      source: "Development fixture",
      lastUpdated: "2026-07-20",
      status: "not_evaluated",
      sideEffects: [],
    },
    assessment: {
      score: null,
      level: "unknown",
      label: "Not evaluated",
      confidence: "insufficient_data",
      factors: [{ code: "NO_DATA", label: "Verified safety data is unavailable" }],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.add.mockResolvedValue({ supported: true, id: "list-1", message: "Medication added." });
  api.get.mockResolvedValue({ supported: true, results: [] });
  api.search.mockResolvedValue({ supported: true, results: [] });
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(cleanup);

describe("MedicationList", () => {
  test("renders multiple persisted medications without unsupported clinical claims", async () => {
    api.get.mockResolvedValue({ supported: true, results: [medication(), medication("list-2", "med-2", "simvastatin")] });
    render(<MedicationList patientId="patient-1" />);
    expect(await screen.findByText(/clopidogrel/i)).toBeTruthy();
    expect(screen.getByText(/simvastatin/i)).toBeTruthy();
    fireEvent.click(screen.getAllByText("Medication details and side effects")[0]);
    expect(screen.getAllByText(/side-effect details are not shown/i).length).toBe(2);
    expect(screen.queryByText(/score 80/i)).toBeNull();
    expect(screen.getAllByText(/general safety assessment: not evaluated/i).length).toBe(2);
  });

  test("adds a searched medication and reloads persisted state", async () => {
    const user = userEvent.setup();
    api.search.mockResolvedValue({ supported: true, results: [{ id: "med-1", genericName: "clopidogrel", brandName: "Plavix" }] });
    api.add.mockResolvedValue({ supported: true, id: "list-1", message: "Medication added." });
    api.get.mockResolvedValueOnce({ supported: true, results: [] }).mockResolvedValueOnce({ supported: true, results: [medication()] });
    render(<MedicationList patientId="patient-1" />);
    await screen.findByText(/list is empty/i);
    await user.type(screen.getByLabelText("Add a medication"), "Plavix");
    await user.click(await screen.findByRole("button", { name: /add clopidogrel/i }));
    expect(await screen.findByText("Medication added.")).toBeTruthy();
    expect(api.add).toHaveBeenCalledWith("med-1");
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  test("warns on a duplicate without calling the add API", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ supported: true, results: [medication()] });
    api.search.mockResolvedValue({ supported: true, results: [{ id: "med-1", genericName: "clopidogrel", brandName: "Plavix" }] });
    render(<MedicationList patientId="patient-1" />);
    await screen.findByText(/clopidogrel/i);
    await user.type(screen.getByLabelText("Add a medication"), "Plavix");
    await user.click(await screen.findByRole("button", { name: /add clopidogrel/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already in your list/i);
    expect(api.add).not.toHaveBeenCalled();
  });

  test("removes a medication and reloads the list", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ supported: true, results: [medication()] }).mockResolvedValueOnce({ supported: true, results: [] });
    api.remove.mockResolvedValue({ supported: true, id: "list-1", message: "Medication removed." });
    render(<MedicationList patientId="patient-1" />);
    await user.click(await screen.findByRole("button", { name: /remove clopidogrel/i }));
    expect(api.remove).toHaveBeenCalledWith("list-1");
    expect(await screen.findByText(/list is empty/i)).toBeTruthy();
  });

  test("shows empty and failure states with an accessible retry control", async () => {
    render(<MedicationList patientId="patient-1" />);
    expect(await screen.findByText(/list is empty/i)).toBeTruthy();
    cleanup();
    api.get.mockRejectedValue(new Error("Service unavailable"));
    render(<MedicationList patientId="patient-2" />);
    expect((await screen.findByRole("alert")).textContent).toContain("Service unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  test("key controls are keyboard reachable and clearly labelled", async () => {
    const user = userEvent.setup();
    api.search.mockResolvedValue({ supported: true, results: [{ id: "med-1", genericName: "clopidogrel", brandName: "Plavix" }] });
    render(<MedicationList patientId="patient-1" />);
    const search = screen.getByLabelText("Add a medication");
    search.focus();
    await user.keyboard("Plavix");
    const addButton = await screen.findByRole("button", { name: /add clopidogrel/i });
    addButton.focus();
    expect(document.activeElement).toBe(addButton);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.add).toHaveBeenCalled());
    await waitFor(() => expect(document.activeElement).toBe(search));
  });

  test("edits status and notes and reloads persisted state", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ supported: true, results: [medication()] });
    api.update.mockResolvedValue({ supported: true, message: "Medication updated." });
    render(<MedicationList patientId="patient-1" />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.selectOptions(screen.getByLabelText("Status"), "past");
    await user.type(screen.getByLabelText("Notes (optional)"), "Reviewed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(api.update).toHaveBeenCalledWith("list-1", { status: "past", notes: "Reviewed" });
    expect(await screen.findByText("Medication updated.")).toBeTruthy();
  });
});
