/** Native Foundry dialog which preserves the form until validation and persistence succeed. */
export function validatedDialogClass(Base) {
  return class extends Base {
    async _onSubmit(target, event) {
      event.preventDefault();
      if (this.pmsSubmitting) return this;
      const action = target?.dataset.action;
      const form = this.element.querySelector("form");
      if (action !== "cancel" && form && !form.reportValidity()) return this;
      const buttons = [...this.element.querySelectorAll(".form-footer button[data-action], footer button[data-action]")];
      const states = buttons.map(button => [button, button.disabled]);
      this.pmsSubmitting = true;
      for (const button of buttons) button.disabled = true;
      this.element.querySelector(".pms-form-error")?.remove();
      try {
        const button = this.options.buttons[action];
        const result = (await button?.callback?.(event, target, this)) ?? button?.action;
        await this.options.submit?.(result, this);
        if (this.options.form.closeOnSubmit) await this.close({submitted: true});
      } catch (error) {
        const message = document.createElement("p");
        message.className = "pms-form-error";
        message.setAttribute("role", "alert");
        message.textContent = error?.message || "Změnu se nepodařilo uložit. Zkus to znovu.";
        (this.element.querySelector(".pms-visit-dialog, .pms-form") ?? form ?? this.element).prepend(message);
      } finally {
        for (const [button, disabled] of states) button.disabled = disabled;
        this.pmsSubmitting = false;
      }
      return this;
    }
  };
}
export const ValidatedDialog = validatedDialogClass(foundry.applications.api.DialogV2);
