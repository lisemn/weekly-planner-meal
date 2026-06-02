// ==================== Export Meal Plan Feature ====================

function showExportMessage(message, isError = false) {
  const alertId = document.getElementById("export-plan-alert")
    ? "export-plan-alert"
    : "dashboard-alert";
  if (isError) showError(alertId, message);
  else showSuccess(alertId, message);
}

function buildExportDayTable(plan, day) {
  const meals = plan[day] || {};
  const rows = MEAL_TYPES.map((type) => {
    const meal = resolveMeal(meals[type]);
    const meta = `${formatMoney(getScaledMealCost(meal))} · ${formatCalories(getScaledMealCalories(meal))}`;
    return `
      <tr>
        <th>${escapeHTML(toTitleCase(type))}</th>
        <td>
          <strong>${escapeHTML(meal.name)}</strong><br>
          <span>${escapeHTML(meta)}</span>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <table class="export-print-table">
      <thead>
        <tr><th colspan="2">${escapeHTML(day)}</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildExportPrintDocument(plan) {
  const summary = calculatePlanSummary(plan);
  const username = getCurrentUser() || "Guest";
  const generatedAt = new Date().toLocaleString();

  const dayTables = DAYS.map((day) => buildExportDayTable(plan, day)).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Meal Plan Export</title>
  <link rel="stylesheet" href="exportMealPlan.css">
</head>
<body class="export-print-page">
  <div class="export-print-header">
    <h1>Weekly Meal Plan</h1>
    <p>Prepared for ${escapeHTML(username)} · Generated ${escapeHTML(generatedAt)}</p>
  </div>

  <div class="export-print-actions">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="export-print-summary">
    <div class="export-print-summary-card">
      <strong>${escapeHTML(formatMoney(summary.totalCost))}</strong>
      <span>Estimated weekly cost</span>
    </div>
    <div class="export-print-summary-card">
      <strong>${escapeHTML(formatCalories(summary.totalCalories))}</strong>
      <span>Estimated weekly calories</span>
    </div>
    <div class="export-print-summary-card">
      <strong>${summary.mealCount}</strong>
      <span>Planned meals</span>
    </div>
  </div>

  ${dayTables}
</body>
</html>`;
}

function exportWeeklyMealPlan() {
  const plan = getCurrentPlan();
  if (!plan) {
    showExportMessage("Generate a weekly meal plan before exporting.", true);
    return;
  }

  const exportWindow = window.open("", "_blank");
  if (!exportWindow) {
    showExportMessage("Pop-up blocked. Allow pop-ups for this site, then try Export Plan again.", true);
    return;
  }

  exportWindow.document.open();
  exportWindow.document.write(buildExportPrintDocument(plan));
  exportWindow.document.close();
  showExportMessage("Export opened in a new tab. Use Print / Save as PDF when you are ready.");
}
