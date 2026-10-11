(function () {
  globalThis.ratingGuardFillForm = function (document, prepared) {
    const main = document.querySelector("main");
    if (
      !main ||
      !prepared.evidence ||
      !prepared.business ||
      !main.textContent.includes(prepared.business) ||
      !main.textContent.includes(prepared.evidence)
    )
      throw new Error(
        "Selected business and exact review evidence are not visible in Google's form.",
      );
    const values = {
      "Business name": prepared.business,
      "Review URL": prepared.reviewUrl,
      "Policy type": prepared.policy,
      Evidence: prepared.request,
    };
    const fields = [...main.querySelectorAll("input,textarea,select")].filter((field) => {
      const label =
        field.getAttribute("aria-label") ||
        [...document.querySelectorAll("label")]
          .find((label) => label.control === field)
          ?.textContent.trim();
      return (
        Object.hasOwn(values, label) &&
        !field.disabled &&
        !field.readOnly &&
        !["hidden", "password", "submit", "checkbox", "radio"].includes(field.type)
      );
    });
    if (!fields.length)
      throw new Error(
        "Unsupported form: no recognized text fields. Choose Google's reporting reason manually.",
      );
    for (const field of fields) {
      const label =
        field.getAttribute("aria-label") ||
        [...document.querySelectorAll("label")]
          .find((label) => label.control === field)
          ?.textContent.trim();
      if (
        field.tagName === "SELECT" &&
        ![...field.options].some((option) => option.value === values[label])
      )
        throw new Error(
          "Google policy options do not match the prepared policy. Select the reason manually.",
        );
    }
    for (const field of fields) {
      const label =
        field.getAttribute("aria-label") ||
        [...document.querySelectorAll("label")]
          .find((label) => label.control === field)
          ?.textContent.trim();
      const prototype =
        field.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : field.tagName === "SELECT"
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, values[label]);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return fields.length;
  };
})();
