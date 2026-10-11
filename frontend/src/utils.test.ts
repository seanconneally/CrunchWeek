import { describe, expect, it } from "vitest";
import {
  addDays,
  dateLabel,
  daysBetween,
  moduleColor,
  monthCells,
  shiftMonth,
  todayIn,
} from "./utils";

describe("date-only utilities", () => {
  it("keeps leap days and year boundaries", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("aligns month cells to Monday without phantom days", () => {
    const cells = monthCells("2026-11");
    expect(cells.slice(0, 6)).toEqual(Array(6).fill(null));
    expect(cells[6]).toBe("2026-11-01");
    expect(cells.at(-1)).toBe("2026-11-30");
  });
  it("does not invent an unknown deadline", () => {
    expect(dateLabel(null)).toBe("Date to confirm");
  });
  it("assigns stable module colours", () => {
    expect(moduleColor("CS401")).toBe(moduleColor("CS401"));
  });
  it("counts whole days across leap days and clock changes", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-11-15", "2026-08-24")).toBe(-83);
  });
  it("falls back to a UTC date for an unknown timezone", () => {
    expect(todayIn("Not/AZone")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
