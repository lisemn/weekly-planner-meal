// mealLock.js
// Lets the user lock individual meal slots so they are preserved when a new
// weekly plan is generated. Unlocked meals can be replaced as normal.
// Loaded after app.js so it can wrap renderMealItem and generateMealPlan.

function getLockedSlots() {
  const user = getCurrentUserData();
  return Array.isArray(user?.mealPlans?.lockedSlots) ? user.mealPlans.lockedSlots : [];
}

function setLockedSlots(slots) {
  saveCurrentUserData((u) => {
    u.mealPlans = u.mealPlans || {};
    u.mealPlans.lockedSlots = Array.from(new Set(slots));
  });
}

function slotKey(day, type) {
  return `${day}:${type}`;
}

function isMealLocked(day, type) {
  return getLockedSlots().includes(slotKey(day, type));
}

function lockMeal(day, type) {
  const slots = getLockedSlots();
  if (!slots.includes(slotKey(day, type))) slots.push(slotKey(day, type));
  setLockedSlots(slots);
}

function unlockMeal(day, type) {
  setLockedSlots(getLockedSlots().filter((s) => s !== slotKey(day, type)));
}

function toggleMealLock(day, type) {
  if (typeof requireLogin === "function" && !requireLogin()) return;

  if (isMealLocked(day, type)) {
    unlockMeal(day, type);
    if (typeof showSuccess === "function") {
      showSuccess("dashboard-alert", `${day} ${toTitleCase(type)} unlocked. It can be replaced next time you generate a plan.`);
    }
  } else {
    lockMeal(day, type);
    if (typeof showSuccess === "function") {
      showSuccess("dashboard-alert", `${day} ${toTitleCase(type)} locked. It will be preserved when generating a new plan.`);
    }
  }

  const plan = getCurrentPlan();
  if (plan && typeof renderMealPlan === "function") renderMealPlan(plan);
}

function unlockAllMeals() {
  if (getLockedSlots().length === 0) return;
  if (!confirm("Unlock all meals?")) return;
  setLockedSlots([]);
  const plan = getCurrentPlan();
  if (plan && typeof renderMealPlan === "function") renderMealPlan(plan);
  if (typeof showSuccess === "function") {
    showSuccess("dashboard-alert", "All meals unlocked.");
  }
}

function captureLockedMealsFromCurrentPlan() {
  const plan = getCurrentPlan();
  if (!plan) return [];
  return getLockedSlots()
    .map((slot) => {
      const [day, type] = slot.split(":");
      const meal = plan?.[day]?.[type];
      return meal ? { day, type, meal: JSON.parse(JSON.stringify(meal)) } : null;
    })
    .filter(Boolean);
}

// Wrap generateMealPlan so locked meal slots are preserved across generations.
(function installGenerateHook() {
  if (typeof generateMealPlan !== "function") {
    console.warn("mealLock.js: generateMealPlan not found. Load AFTER app.js.");
    return;
  }
  const originalGenerateMealPlan = generateMealPlan;
  window.generateMealPlan = function patchedGenerateMealPlan() {
    const captured = captureLockedMealsFromCurrentPlan();
    originalGenerateMealPlan();

    if (!captured.length) return;

    const plan = getCurrentPlan();
    if (!plan) return;

    captured.forEach(({ day, type, meal }) => {
      if (plan[day]) plan[day][type] = meal;
    });

    // Save the locked-overrides without re-archiving (skip the history hook).
    saveCurrentUserData((u) => {
      u.mealPlans = u.mealPlans || {};
      u.mealPlans.current = plan;
    });

    if (typeof syncPrepTasksWithPlan === "function") {
      syncPrepTasksWithPlan({ resetAutoTasks: true });
    }
    if (typeof renderMealPlan === "function") renderMealPlan(plan);

    if (typeof showSuccess === "function") {
      showSuccess(
        "dashboard-alert",
        `New plan generated. ${captured.length} locked meal${captured.length === 1 ? "" : "s"} preserved.`
      );
    }
  };
})();

// Wrap renderMealItem to inject a Lock / Unlock toggle button and visual state.
(function installRenderItemHook() {
  if (typeof renderMealItem !== "function") {
    console.warn("mealLock.js: renderMealItem not found. Load AFTER app.js.");
    return;
  }
  const originalRenderMealItem = renderMealItem;
  window.renderMealItem = function patchedRenderMealItem(day, type, label, meal) {
    let html = originalRenderMealItem(day, type, label, meal);

    if (typeof viewingSharedPlan !== "undefined" && viewingSharedPlan) {
      return html;
    }

    const locked = isMealLocked(day, type);
    const buttonClass = `btn btn-outline btn-xs lock-btn${locked ? " is-locked" : ""}`;
    const buttonLabel = locked ? "Unlock" : "Lock";
    const buttonTitle = locked ? "Click to unlock this meal" : "Click to lock this meal so it stays when you generate a new plan";
    const lockButton = `<button class="${buttonClass}" onclick="toggleMealLock('${day}', '${type}')" title="${buttonTitle}">${buttonLabel}</button>`;

    html = html.replace('<span class="meal-actions">', `<span class="meal-actions">${lockButton}`);

    if (locked) {
      html = html.replace('<div class="meal-row">', '<div class="meal-row meal-row-locked">');
      html = html.replace(
        '<span class="meal-name">',
        '<span class="meal-name"><span class="lock-indicator" title="Locked">Locked</span> '
      );
    }

    return html;
  };
})();

// Wrap renderMealPlan to add a small toolbar that summarises lock state.
(function installRenderPlanHook() {
  if (typeof renderMealPlan !== "function") {
    console.warn("mealLock.js: renderMealPlan not found. Load AFTER app.js.");
    return;
  }
  const originalRenderMealPlan = renderMealPlan;
  window.renderMealPlan = function patchedRenderMealPlan(plan) {
    originalRenderMealPlan(plan);

    const grid = document.getElementById("meal-plan-grid");
    if (!grid) return;

    document.querySelectorAll(".lock-status-banner").forEach((el) => el.remove());

    if (typeof viewingSharedPlan !== "undefined" && viewingSharedPlan) return;

    const locked = getLockedSlots().length;
    const banner = document.createElement("div");
    banner.className = "lock-status-banner";
    banner.innerHTML = locked
      ? `<span><strong>${locked}</strong> meal${locked === 1 ? "" : "s"} locked. They will stay in place when you generate a new plan.</span>
         <button class="btn btn-outline btn-xs" onclick="unlockAllMeals()">Unlock All</button>`
      : `<span>No meals locked. Click <strong>Lock</strong> on any meal to keep it when generating a new plan.</span>`;
    grid.parentNode.insertBefore(banner, grid);
  };
})();