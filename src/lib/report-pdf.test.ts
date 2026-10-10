// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { jsPDF } from "jspdf";
import { toCanvas } from "html-to-image";
import { downloadReportPdf } from "./report-pdf";

vi.mock("html-to-image", () => ({ toCanvas: vi.fn() }));
const { save, draw } = vi.hoisted(() => ({ save: vi.fn(), draw: vi.fn() }));
vi.mock("jspdf", async (importOriginal) => {
  const original = await importOriginal<typeof import("jspdf")>();
  return {
    jsPDF: class extends original.jsPDF {
      constructor(options: ConstructorParameters<typeof original.jsPDF>[0]) {
        super(options);
        this.save = save;
      }
    },
  };
});

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4XmP4DwQACfsD/YcUtbcAAAAASUVORK5CYII=";

describe("report PDF download", () => {
  beforeEach(() => {
    save.mockReset();
    draw.mockReset();
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: draw,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(png);
  });
  afterEach(() => vi.restoreAllMocks());

  it("exports every captured row to a genuine multipage PDF with the requested filename", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 3000;
    vi.mocked(toCanvas).mockResolvedValue(canvas);
    save.mockImplementation(function (this: jsPDF, filename: string) {
      expect(filename).toBe("RPT-HUDSON.pdf");
      expect(this.output()).toMatch(/^%PDF-/);
      expect(this.getNumberOfPages()).toBe(3);
      return Promise.resolve();
    });
    await downloadReportPdf(document.createElement("article"), "RPT-HUDSON.pdf");
    expect(save).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenNthCalledWith(1, canvas, 0, 0, 1000, 1457, 0, 0, 1000, 1457);
    expect(draw).toHaveBeenNthCalledWith(2, canvas, 0, 1457, 1000, 1457, 0, 0, 1000, 1457);
    expect(draw).toHaveBeenNthCalledWith(3, canvas, 0, 2914, 1000, 86, 0, 0, 1000, 86);
  });

  it("rejects empty captures rather than saving an empty report", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 0;
    vi.mocked(toCanvas).mockResolvedValue(canvas);
    await expect(
      downloadReportPdf(document.createElement("article"), "report.pdf"),
    ).rejects.toThrow("empty");
    expect(save).not.toHaveBeenCalled();
  });

  it("propagates capture failures without a success-shaped print fallback", async () => {
    vi.mocked(toCanvas).mockRejectedValue(new Error("Capture unavailable"));
    await expect(
      downloadReportPdf(document.createElement("article"), "report.pdf"),
    ).rejects.toThrow("Capture unavailable");
  });
});
