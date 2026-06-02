// planHistory.js
// Archives the current weekly meal plan when the user generates a new one,
// and provides a Plan History UI to view, restore, or delete past plans.
// Loaded after app.js so it can wrap existing functions.

const PLAN_HISTORY_LIMIT = 20;

function createPlanHistoryId() {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPlanHistory() {
  const user = getCurrentUserData();
  return Array.isArray(user?.mealPlans?.history) ? user.mealPlans.history : [];
}

function summarisePlanForHistory(plan) {
  try {
    const s = calculatePlanSummary(plan);
    return {
      mealCount: s.mealCount,
      totalCost: s.totalCost,
      totalCalories: s.totalCalories,
    };
  } catch (e) {
    return { mealCount: 0, totalCost: 0, totalCalories: 0 };
  }
}

function archiveCurrentPlanToHistory() {
  const user = getCurrentUserData();
  const currentPlan = user?.mealPlans?.current;
  if (!user || !currentPlan) return;

  saveCurrentUserData((u) => {
    u.mealPlans = u.mealPlans || {};
    const history = Array.isArray(u.mealPlans.history) ? u.mealPlans.history : [];
    history.unshift({
      id: createPlanHistoryId(),
      savedAt: u.mealPlans.generatedAt || new Date().toISOString(),
      archivedAt: new Date().toISOString(),
      plan: JSON.parse(JSON.stringify(currentPlan)),
      summary: summarisePlanForHistory(currentPlan),
    });
    u.mealPlans.history = history.slice(0, PLAN_HISTORY_LIMIT);
  });
}

// Wrap Generate New Plan only. This avoids filling history with small changes
// such as marking meals completed, changing serving size, or editing task states.
(function installPlanHistoryHook() {
  if (typeof generateMealPlan !== "function") {
    console.warn("planHistory.js: generateMealPlan not found. Make sure planHistory.js is loaded AFTER app.js.");
    return;
  }
  const originalGenerateMealPlan = generateMealPlan;
  window.generateMealPlan = function patchedGenerateMealPlan() {
    archiveCurrentPlanToHistory();
    return originalGenerateMealPlan();
  };
})();

function restorePlanFromHistory(entryId) {
  const entry = getPlanHistory().find((item) => item.id === entryId);
  if (!entry) return;

  saveCurrentPlan(JSON.parse(JSON.stringify(entry.plan)));
  if (typeof syncPrepTasksWithPlan === "function") {
    syncPrepTasksWithPlan({ resetAutoTasks: true });
  }
  if (typeof renderMealPlan === "function") {
    renderMealPlan(getCurrentPlan());
  }
  closePlanHistoryModal();
  if (typeof showSuccess === "function") {
    showSuccess("dashboard-alert", "Previous plan restored as your current weekly plan.");
  }
}

function deletePlanFromHistory(entryId) {
  if (!confirm("Remove this plan from your history?")) return;
  saveCurrentUserData((u) => {
    u.mealPlans = u.mealPlans || {};
    u.mealPlans.history = (u.mealPlans.history || []).filter((item) => item.id !== entryId);
  });
  renderPlanHistory();
}

function clearPlanHistory() {
  if (!confirm("Delete ALL archived plans? This cannot be undone.")) return;
  saveCurrentUserData((u) => {
    u.mealPlans = u.mealPlans || {};
    u.mealPlans.history = [];
  });
  renderPlanHistory();
}

function renderPlanHistory() {
  const container = document.getElementById("plan-history-list");
  if (!container) return;

  const history = getPlanHistory();
  if (history.length === 0) {
    container.innerHTML =
      '<p class="empty-state small-empty">No previous plans archived yet. Generate a new plan to start building history.</p>';
    return;
  }

  container.innerHTML = history
    .map((entry) => {
      const date = new Date(entry.archivedAt || entry.savedAt).toLocaleString();
      const cost = formatMoney(entry.summary?.totalCost || 0);
      const calories = formatCalories(entry.summary?.totalCalories || 0);
      const mealCount = entry.summary?.mealCount || 0;
      const dayLines = DAYS.map((day) => {
        const dayMeals = entry.plan?.[day] || {};
        const b = resolveMeal(dayMeals.breakfast).name;
        const l = resolveMeal(dayMeals.lunch).name;
        const d = resolveMeal(dayMeals.dinner).name;
        const s = resolveMeal(dayMeals.snack).name;
        return `<li><strong>${day}:</strong> ${escapeHTML(b)} · ${escapeHTML(l)} · ${escapeHTML(d)} · ${escapeHTML(s)}</li>`;
      }).join("");

      return `
        <div class="history-card">
          <div class="history-card-top">
            <div>
              <strong>Archived ${escapeHTML(date)}</strong>
              <p class="meal-meta">${mealCount} meals · ${cost} · ${calories}</p>
            </div>
            <div class="button-row compact-actions">
              <button class="btn btn-primary btn-xs" onclick="restorePlanFromHistory('${entry.id}')">Restore</button>
              <button class="btn btn-outline btn-xs danger-btn" onclick="deletePlanFromHistory('${entry.id}')">Delete</button>
            </div>
          </div>
          <ul class="history-meal-list">${dayLines}</ul>
        </div>
      `;
    })
    .join("");
}

function openPlanHistoryModal() {
  if (typeof requireLogin === "function" && !requireLogin()) return;
  renderPlanHistory();
  const modal = document.getElementById("plan-history-modal");
  if (modal) {
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  }
}

function closePlanHistoryModal() {
  const modal = document.getElementById("plan-history-modal");
  if (modal) {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
}

// Inject the History button + modal so index.html stays minimal.
(function injectPlanHistoryUI() {
  function setup() {
    const generateBtn = document.getElementById("generate-plan-btn");
    if (generateBtn && !document.getElementById("plan-history-btn")) {
      const historyBtn = document.createElement("button");
      historyBtn.id = "plan-history-btn";
      historyBtn.className = "btn btn-outline";
      historyBtn.textContent = "Plan History";
      historyBtn.onclick = openPlanHistoryModal;
      generateBtn.parentNode.insertBefore(historyBtn, generateBtn);
    }

    if (!document.getElementById("plan-history-modal")) {
      const modal = document.createElement("div");
      modal.id = "plan-history-modal";
      modal.className = "modal-overlay";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `
        <div class="modal-card history-modal-card">
          <div class="modal-header">
            <div>
              <h2>Plan History</h2>
              <p class="page-note">Previously generated weekly plans are archived here. Restore one to make it your current plan.</p>
            </div>
            <button class="icon-button" onclick="closePlanHistoryModal()" aria-label="Close">&times;</button>
          </div>
          <div class="button-row align-right history-toolbar">
            <button class="btn btn-outline btn-xs danger-btn" onclick="clearPlanHistory()">Clear All History</button>
          </div>
          <div id="plan-history-list" class="history-list"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();
