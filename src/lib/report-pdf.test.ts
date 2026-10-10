// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { jsPDF } from "jspdf";
import { toSvg } from "html-to-image";
import { downloadReportPdf } from "./report-pdf";

vi.mock("html-to-image", () => ({ toSvg: vi.fn() }));
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
    vi.mocked(toSvg).mockResolvedValue("data:image/svg+xml,fixture");
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: draw,
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(png);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function reportElement(width = 500, height = 1500) {
    const element = document.createElement("article");
    Object.defineProperties(element, {
      scrollWidth: { value: width },
      scrollHeight: { value: height },
    });
    return element;
  }

  it("exports every captured row to a genuine multipage PDF with the requested filename", async () => {
    save.mockImplementation(function (this: jsPDF, filename: string) {
      expect(filename).toBe("RPT-HUDSON.pdf");
      expect(this.output()).toMatch(/^%PDF-/);
      expect(this.getNumberOfPages()).toBe(3);
      return Promise.resolve();
    });
    await downloadReportPdf(reportElement(), "RPT-HUDSON.pdf");
    expect(save).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenNthCalledWith(
      2,
      expect.any(HTMLCanvasElement),
      0,
      0,
      1000,
      1457,
      0,
      0,
      1000,
      1457,
    );
    expect(draw).toHaveBeenNthCalledWith(
      3,
      expect.any(HTMLCanvasElement),
      0,
      1457,
      1000,
      1457,
      0,
      0,
      1000,
      1457,
    );
    expect(draw).toHaveBeenNthCalledWith(
      4,
      expect.any(HTMLCanvasElement),
      0,
      2914,
      1000,
      86,
      0,
      0,
      1000,
      86,
    );
  });

  it("rejects empty captures rather than saving an empty report", async () => {
    await expect(downloadReportPdf(reportElement(0), "report.pdf")).rejects.toThrow("empty");
    expect(save).not.toHaveBeenCalled();
  });

  it("propagates capture failures without a success-shaped print fallback", async () => {
    vi.mocked(toSvg).mockRejectedValue(new Error("Capture unavailable"));
    await expect(downloadReportPdf(reportElement(), "report.pdf")).rejects.toThrow(
      "Capture unavailable",
    );
  });
});
