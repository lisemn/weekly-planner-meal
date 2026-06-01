// ==================== Utility ====================

let viewingSharedPlan = false;
let reviewTargetRecipeName = "";
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD_LABEL = "admin123";
const DEFAULT_ADMIN_PASSWORD_HASH = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getUsers() {
  return JSON.parse(localStorage.getItem("mealapp_users") || "{}");
}

function saveUsers(users) {
  localStorage.setItem("mealapp_users", JSON.stringify(users));
  queueDatabasePersist();
}

let sqliteApiAvailable = false;
let databaseSaveTimer = null;

async function loadDatabaseState() {
  if (window.location.protocol === "file:") return;

  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("SQLite API unavailable");

    const state = await response.json();
    if (state.users) localStorage.setItem("mealapp_users", JSON.stringify(state.users));
    if (state.reviews) localStorage.setItem("mealapp_reviews", JSON.stringify(state.reviews));
    sqliteApiAvailable = true;
  } catch (error) {
    console.warn("SQLite API not loaded. Falling back to browser localStorage.", error);
    sqliteApiAvailable = false;
  }
}

function queueDatabasePersist() {
  if (!sqliteApiAvailable) return;
  window.clearTimeout(databaseSaveTimer);
  databaseSaveTimer = window.setTimeout(saveDatabaseStateNow, 200);
}

async function saveDatabaseStateNow() {
  if (!sqliteApiAvailable) return;
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        users: getUsers(),
        reviews: getReviews(),
      }),
    });
  } catch (error) {
    console.warn("Could not save data to SQLite database.", error);
  }
}

function getCurrentUser() {
  return sessionStorage.getItem("mealapp_session");
}

function getCurrentUserData() {
  const username = getCurrentUser();
  const users = getUsers();
  return username ? users[username] : null;
}

function saveCurrentUserData(updateFn) {
  const username = getCurrentUser();
  if (!username) return false;

  const users = getUsers();
  if (!users[username]) return false;

  ensureUserShape(users[username], username);
  updateFn(users[username]);
  saveUsers(users);
  return true;
}

function ensureUserShape(user, username) {
  user.role = user.role || "user";
  user.profile = user.profile || {
    displayName: username,
    age: "",
    calorieTarget: "",
    weeklyBudget: "",
  };
  user.preferences = user.preferences || { dietary: [], allergies: [] };
  user.settings = user.settings || {};
  user.settings.measurementUnit = user.settings.measurementUnit || "metric";
  user.settings.servingSize = Number(user.settings.servingSize || 1);
  user.mealPlans = user.mealPlans || {};
  user.customRecipes = user.customRecipes || [];
  user.prepTasks = user.prepTasks || [];
  user.hiddenPrepTaskIds = user.hiddenPrepTaskIds || [];
}

function getCheckedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(
    (input) => input.value
  );
}

function setCheckedValues(name, values = []) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = values.includes(input.value);
  });
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toTitleCase(value) {
  return String(value || "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function formatCalories(amount) {
  return `${Math.round(Number(amount || 0)).toLocaleString()} kcal`;
}

function formatNumber(amount) {
  const number = Number(amount || 0);
  if (Number.isInteger(number)) return String(number);
  return number.toFixed(1).replace(/\.0$/, "");
}


// ==================== Weight / Serving Unit Helpers ====================
// These values keep Sprint 2 serving-size and unit switching realistic enough for a prototype.
// Each ingredient receives a per-serving gram estimate, then the selected serving size multiplies it.
const UNIT_GRAMS = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
  cup: 240,
  cups: 240,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  pcs: 100,
  pc: 100,
  piece: 100,
  pieces: 100,
  slice: 35,
  slices: 35,
  can: 165,
  cans: 165,
  scoop: 30,
  scoops: 30,
  serve: 150,
  serving: 150,
  servings: 150,
  leaves: 5,
  leaf: 5,
  pinch: 0.3,
};

const INGREDIENT_GRAMS_PER_UNIT = {
  "rolled oats": { cup: 80 },
  "mixed berries": { cup: 75 },
  "frozen mango": { cup: 82 },
  "mango": { cup: 82 },
  "honey": { tbsp: 21, tsp: 7 },
  "milk": { cup: 240 },
  "coconut milk": { cup: 240 },
  "greek yogurt": { cup: 245 },
  "granola": { cup: 122 },
  "banana": { pcs: 120 },
  "apple": { pcs: 180 },
  "avocado": { pcs: 150 },
  "lemon": { pcs: 60 },
  "eggs": { pcs: 50 },
  "egg": { pcs: 50 },
  "wholemeal bread": { slices: 35, slice: 35 },
  "pita bread": { pcs: 65 },
  "wrap": { pcs: 60 },
  "butter": { tsp: 5 },
  "spinach": { cup: 30 },
  "cheese": { cup: 113 },
  "capsicum": { pcs: 120 },
  "mushrooms": { cup: 70 },
  "firm tofu": { g: 1 },
  "tomato": { pcs: 120 },
  "cherry tomatoes": { cup: 150 },
  "turmeric": { tsp: 3 },
  "chicken breast": { g: 1 },
  "chicken mince": { g: 1 },
  "tuna": { can: 140 },
  "rice": { cup: 158 },
  "cucumber": { pcs: 200 },
  "soy sauce": { tbsp: 16 },
  "quinoa": { cup: 185 },
  "chickpeas": { cup: 164 },
  "feta": { cup: 150 },
  "turkey slices": { g: 1 },
  "turkey mince": { g: 1 },
  "lettuce": { cup: 45, leaves: 5 },
  "lentils": { cup: 198 },
  "carrot": { pcs: 70 },
  "onion": { pcs: 110 },
  "lean beef mince": { g: 1 },
  "black beans": { cup: 172 },
  "salsa": { tbsp: 16 },
  "falafel": { pcs: 25 },
  "hummus": { tbsp: 15 },
  "salmon fillet": { g: 1 },
  "potatoes": { pcs: 150 },
  "green beans": { cup: 100 },
  "beef strips": { g: 1 },
  "egg noodles": { serve: 180 },
  "mixed vegetables": { cup: 150 },
  "broccoli": { cup: 91 },
  "olive oil": { tbsp: 14 },
  "pasta": { serve: 180 },
  "tomato sauce": { cup: 245 },
  "curry paste": { tbsp: 15 },
  "maple syrup": { tsp: 7 },
  "chia seeds": { tbsp: 12 },
  "peanut butter": { tbsp: 16 },
  "edamame": { cup: 155 },
  "sea salt": { pinch: 0.3 },
  "rice crackers": { pcs: 7 },
  "mixed nuts": { cup: 140 },
  "raisins": { tbsp: 10 },
  "protein powder": { scoop: 30 },
};

function normaliseUnitName(unit) {
  return String(unit || "unit").trim().toLowerCase();
}

function getIngredientGramsPerUnit(item = {}) {
  const unit = normaliseUnitName(item.unit);
  const explicit = Number(item.gramsPerUnit || item.grams_per_unit || 0);
  if (explicit > 0) return explicit;

  const name = String(item.name || "").trim().toLowerCase();
  const exact = INGREDIENT_GRAMS_PER_UNIT[name]?.[unit];
  if (exact) return exact;

  const partialKey = Object.keys(INGREDIENT_GRAMS_PER_UNIT).find((key) => name.includes(key) && INGREDIENT_GRAMS_PER_UNIT[key][unit]);
  if (partialKey) return INGREDIENT_GRAMS_PER_UNIT[partialKey][unit];

  return UNIT_GRAMS[unit] || 100;
}

function normaliseIngredientWeight(item = {}) {
  const qty = Number(item.qty || 0);
  const unit = item.unit || "unit";
  const gramsPerUnit = getIngredientGramsPerUnit(item);
  const baseGrams = Number(item.baseGrams || item.grams || qty * gramsPerUnit || 0);
  return {
    ...item,
    qty,
    unit,
    gramsPerUnit,
    baseGrams,
  };
}

function getMealPortionGrams(meal = {}) {
  const explicit = Number(meal.portionGrams || meal.portionWeightGrams || 0);
  if (explicit > 0) return explicit;
  return (meal.ingredients || []).reduce((total, item) => total + normaliseIngredientWeight(item).baseGrams, 0);
}

function getScaledMealWeightGrams(meal = {}) {
  return getMealPortionGrams(meal) * getServingSize();
}

function formatWeightFromGrams(grams, unit = getMeasurementUnit()) {
  const value = Number(grams || 0);
  if (unit === "ounces") return `${formatNumber(value / 28.3495)} oz`;
  if (unit === "pounds") return `${formatNumber(value / 453.592)} lb`;
  if (unit === "cups") return `${formatNumber(value / 240)} cups`;
  return `${formatNumber(value)} g`;
}

function getMeasurementUnitLabel(unit = getMeasurementUnit()) {
  if (unit === "ounces") return "Ounces";
  if (unit === "pounds") return "Pounds";
  if (unit === "cups") return "Cups";
  return "Grams";
}


function setSharedPlanMode(active) {
  viewingSharedPlan = Boolean(active);

  const title = document.getElementById("dashboard-title");
  const note = document.getElementById("dashboard-note");
  const shoppingButton = document.getElementById("view-shopping-btn");
  const shareButton = document.getElementById("share-plan-btn");
  const generateButton = document.getElementById("generate-plan-btn");
  const featurePanel = document.getElementById("zhu-feature-panel");

  if (title) title.textContent = viewingSharedPlan ? "Shared Meal Plan" : "Your Weekly Meal Plan";
  if (note) {
    note.textContent = viewingSharedPlan
      ? "This is a read-only shared weekly meal plan. Log in to generate, customise, review, or save your own plans."
      : "Plans are generated using allergies, dietary preferences, budget, calories, and recipe data. Use Customise to replace meals.";
  }

  [shoppingButton, shareButton, generateButton].forEach((button) => {
    if (button) button.style.display = viewingSharedPlan ? "none" : "inline-flex";
  });
  if (featurePanel) featurePanel.style.display = viewingSharedPlan ? "none" : "grid";
}

function reviewStorageKey(recipeName) {
  return String(recipeName || "").trim().toLowerCase();
}

function encodeRecipeNameForHandler(recipeName) {
  return encodeURIComponent(String(recipeName || "")).replace(/'/g, "%27");
}

function encodeReviewIdForHandler(reviewId) {
  return encodeURIComponent(String(reviewId || "")).replace(/'/g, "%27");
}

function openReviewModalFromEncoded(encodedRecipeName) {
  openReviewModal(decodeURIComponent(encodedRecipeName));
}

function isAdminUser(username = getCurrentUser()) {
  if (!username) return false;
  const users = getUsers();
  return users[username]?.role === "admin";
}

function getReviews() {
  return JSON.parse(localStorage.getItem("mealapp_reviews") || "{}");
}

function saveReviews(reviews) {
  localStorage.setItem("mealapp_reviews", JSON.stringify(reviews));
  queueDatabasePersist();
}

function createReviewId() {
  return `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRecipeReviews(recipeName) {
  const reviews = getReviews();
  const key = reviewStorageKey(recipeName);
  return reviews[key] || [];
}

function getNormalisedRecipeReviews(recipeName) {
  const reviews = getReviews();
  const key = reviewStorageKey(recipeName);
  let changed = false;
  reviews[key] = (reviews[key] || []).map((review, index) => {
    if (!review.id) {
      changed = true;
      return { ...review, id: `review-${Date.now()}-${index}` };
    }
    return review;
  });
  if (changed) saveReviews(reviews);
  return reviews[key];
}

function getAverageRating(recipeName) {
  const reviews = getNormalisedRecipeReviews(recipeName);
  if (!reviews.length) return 0;
  const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
  return Number((total / reviews.length).toFixed(1));
}

function getReviewSummary(recipeName) {
  const reviews = getNormalisedRecipeReviews(recipeName);
  if (!reviews.length) return "No reviews yet";
  const average = getAverageRating(recipeName).toFixed(1);
  return `⭐ ${average}/5 · ${reviews.length} review${reviews.length === 1 ? "" : "s"}`;
}

function findUserReview(recipeName, username = getCurrentUser()) {
  if (!username) return null;
  return getNormalisedRecipeReviews(recipeName).find((review) => review.user === username) || null;
}

function submitReview(recipeName, rating, comment) {
  const username = getCurrentUser();
  if (!username) return { ok: false, status: "login" };

  const numericRating = Number(rating);
  if (!recipeName || numericRating < 1 || numericRating > 5) return { ok: false, status: "invalid" };

  const reviews = getReviews();
  const key = reviewStorageKey(recipeName);
  reviews[key] = reviews[key] || [];
  const existing = reviews[key].find((review) => review.user === username);

  if (existing) {
    existing.rating = numericRating;
    existing.updatedAt = new Date().toISOString();
    saveReviews(reviews);
    return { ok: true, status: "updated" };
  }

  reviews[key].push({
    id: createReviewId(),
    recipeName,
    user: username,
    rating: numericRating,
    comment: String(comment || "").trim() || "No written comment.",
    date: new Date().toISOString(),
  });

  saveReviews(reviews);
  return { ok: true, status: "created" };
}

function canEditReview(review) {
  const username = getCurrentUser();
  return Boolean(username && (review.user === username || isAdminUser(username)));
}

function canDeleteReview(review) {
  return isAdminUser();
}

function renderReviews(recipeName, containerId = "review-list") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const reviews = getNormalisedRecipeReviews(recipeName);
  if (!reviews.length) {
    container.innerHTML = '<p class="empty-state small-empty">No reviews yet.</p>';
    return;
  }

  const encodedRecipe = encodeRecipeNameForHandler(recipeName);
  container.innerHTML = reviews
    .slice()
    .reverse()
    .map((review) => {
      const encodedReviewId = encodeReviewIdForHandler(review.id);
      const actions = [];
      if (canEditReview(review)) {
        actions.push(`<button class="btn btn-outline btn-xs" onclick="editReviewRatingFromEncoded('${encodedRecipe}', '${encodedReviewId}')">Edit Rating</button>`);
      }
      if (canDeleteReview(review)) {
        actions.push(`<button class="btn btn-outline btn-xs danger-btn" onclick="deleteReviewFromEncoded('${encodedRecipe}', '${encodedReviewId}')">Delete</button>`);
      }
      const updated = review.updatedAt ? ` · rating updated ${new Date(review.updatedAt).toLocaleDateString()}` : "";
      return `
        <div class="review-card">
          <div class="review-card-top">
            <strong>${escapeHTML(review.user)}${isAdminUser(review.user) ? ' <span class="tag-pill">Admin</span>' : ""}</strong>
            <span>${"⭐".repeat(Number(review.rating || 0))} ${Number(review.rating || 0)}/5</span>
          </div>
          <p>${escapeHTML(review.comment)}</p>
          <div class="review-card-bottom">
            <small>${new Date(review.date).toLocaleDateString()}${updated}</small>
            <span class="button-row compact-actions">${actions.join("")}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function openReviewModal(recipeName) {
  const username = requireLogin();
  if (!username) return;

  reviewTargetRecipeName = recipeName;
  const ownReview = findUserReview(recipeName, username);
  const commentInput = document.getElementById("review-comment");
  const note = document.getElementById("review-comment-note");
  document.getElementById("review-modal-title").textContent = `Rate & Review: ${recipeName}`;
  document.getElementById("review-context").textContent = getReviewSummary(recipeName);
  document.getElementById("review-rating").value = ownReview ? String(ownReview.rating || 5) : "5";
  commentInput.value = ownReview ? ownReview.comment : "";
  commentInput.disabled = Boolean(ownReview);
  commentInput.placeholder = ownReview ? "Existing comment is locked. Edit only updates the rating." : "e.g. Easy to cook and tasted good";
  if (note) {
    note.textContent = ownReview
      ? "You already reviewed this recipe. Save Review will update only your star rating."
      : "Add a comment with your first review. Later edits update the rating only.";
  }
  renderReviews(recipeName);
  document.getElementById("review-modal").classList.add("active");
  document.getElementById("review-modal").setAttribute("aria-hidden", "false");
}

function closeReviewModal() {
  document.getElementById("review-modal").classList.remove("active");
  document.getElementById("review-modal").setAttribute("aria-hidden", "true");
}

function refreshReviewUI(recipeName) {
  const context = document.getElementById("review-context");
  if (context) context.textContent = getReviewSummary(recipeName);
  renderReviews(recipeName);
  renderRecipeLibrary();
  const plan = getCurrentPlan();
  if (plan) renderMealPlan(plan);
}

function saveReviewFromModal() {
  const rating = document.getElementById("review-rating").value;
  const comment = document.getElementById("review-comment").value;

  const result = submitReview(reviewTargetRecipeName, rating, comment);
  if (!result.ok) {
    showError("dashboard-alert", "Please log in and choose a valid rating before saving a review.");
    return;
  }

  refreshReviewUI(reviewTargetRecipeName);
  openReviewModal(reviewTargetRecipeName);
  showSuccess("dashboard-alert", result.status === "updated" ? "Rating updated. Existing comment was kept unchanged." : "Review saved successfully.");
}

function editReviewRatingFromEncoded(encodedRecipeName, encodedReviewId) {
  const recipeName = decodeURIComponent(encodedRecipeName);
  const reviewId = decodeURIComponent(encodedReviewId);
  const reviews = getReviews();
  const key = reviewStorageKey(recipeName);
  const review = (reviews[key] || []).find((item) => item.id === reviewId);
  if (!review || !canEditReview(review)) return;

  const newRating = window.prompt("Enter a new rating from 1 to 5. Only the rating will be changed.", String(review.rating || 5));
  if (newRating === null) return;
  const numericRating = Number(newRating);
  if (numericRating < 1 || numericRating > 5) {
    showError("dashboard-alert", "Rating must be between 1 and 5.");
    return;
  }

  review.rating = numericRating;
  review.updatedAt = new Date().toISOString();
  saveReviews(reviews);
  refreshReviewUI(recipeName);
  showSuccess("dashboard-alert", "Review rating updated. Comment was not changed.");
}

function deleteReviewFromEncoded(encodedRecipeName, encodedReviewId) {
  const recipeName = decodeURIComponent(encodedRecipeName);
  const reviewId = decodeURIComponent(encodedReviewId);
  if (!isAdminUser()) return;

  const confirmed = confirm("Delete this review? Admin moderation can remove old or inappropriate reviews.");
  if (!confirmed) return;

  const reviews = getReviews();
  const key = reviewStorageKey(recipeName);
  reviews[key] = (reviews[key] || []).filter((review) => review.id !== reviewId);
  saveReviews(reviews);
  refreshReviewUI(recipeName);
  showSuccess("dashboard-alert", "Review deleted by admin.");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeSharePlan(plan) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(plan)));
}

function decodeSharePlan(payload) {
  const bytes = base64UrlToBytes(payload);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function getShareablePlan() {
  const username = getCurrentUser();
  const users = getUsers();
  return username ? users[username]?.mealPlans?.current : null;
}

function buildShareLink(plan) {
  const baseUrl = window.location.href.split("?")[0].split("#")[0];
  return `${baseUrl}?shared=${encodeSharePlan(plan)}`;
}

function getMealLine(plan, day) {
  const meals = plan?.[day] || {};
  return `Breakfast - ${resolveMeal(meals.breakfast).name}; Lunch - ${resolveMeal(meals.lunch).name}; Dinner - ${resolveMeal(meals.dinner).name}; Snack - ${resolveMeal(meals.snack).name}`;
}

function buildPlanSummaryText(plan) {
  const summary = calculatePlanSummary(plan);
  const lines = [
    "My Weekly Meal Plan",
    "",
    ...DAYS.map((day) => `${day}: ${getMealLine(plan, day)}`),
    "",
    `Estimated weekly cost: ${formatMoney(summary.totalCost)}`,
    `Estimated weekly calories: ${formatCalories(summary.totalCalories)}`,
    `Total meals: ${summary.mealCount}`,
  ];
  return lines.join("\n");
}

function buildDiscordMessage(plan) {
  const summary = calculatePlanSummary(plan);
  const lines = [
    "🍽️ **Weekly Meal Plan**",
    ...DAYS.map((day) => `**${day}:** ${getMealLine(plan, day)}`),
    `💰 Estimated cost: ${formatMoney(summary.totalCost)}`,
    `🔥 Weekly calories: ${formatCalories(summary.totalCalories)}`,
  ];
  return lines.join("\n");
}

function renderSharePreview(plan) {
  const preview = document.getElementById("share-preview");
  if (!preview) return;

  const summary = calculatePlanSummary(plan);
  preview.innerHTML = `
    <div class="share-preview-header">
      <div>
        <h3>Read-only Weekly Plan Preview</h3>
        <p class="meal-meta">This preview is formatted for family members, housemates, or group chat sharing.</p>
      </div>
      <div class="share-summary-pills">
        <span class="tag-pill">${summary.mealCount} meals</span>
        <span class="tag-pill">${formatMoney(summary.totalCost)}</span>
        <span class="tag-pill">${formatCalories(summary.totalCalories)}</span>
      </div>
    </div>
    <div class="share-day-list">
      ${DAYS.map((day) => `
        <div class="share-day-card">
          <strong>${day}</strong>
          <p>${escapeHTML(getMealLine(plan, day))}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function openSharePanel() {
  const username = requireLogin();
  if (!username) return;
  const plan = getShareablePlan();
  if (!plan) {
    showError("dashboard-alert", "Generate a weekly meal plan before sharing.");
    return;
  }

  renderSharePreview(plan);
  const alert = document.getElementById("share-panel-alert");
  if (alert) {
    alert.classList.remove("show");
    alert.textContent = "";
  }
  document.getElementById("share-modal").classList.add("active");
  document.getElementById("share-modal").setAttribute("aria-hidden", "false");
}

function closeSharePanel() {
  document.getElementById("share-modal").classList.remove("active");
  document.getElementById("share-modal").setAttribute("aria-hidden", "true");
}

async function copyTextForSharing(text, successMessage) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(text);
    showSuccess("share-panel-alert", successMessage);
  } catch (error) {
    window.prompt("Copy this text:", text);
    showSuccess("share-panel-alert", "Copy it from the popup if it was not copied automatically.");
  }
}

function copyPlanSummary() {
  const plan = getShareablePlan();
  if (!plan) return;
  copyTextForSharing(buildPlanSummaryText(plan), "Plan summary copied.");
}

function copyDiscordMessage() {
  const plan = getShareablePlan();
  if (!plan) return;
  copyTextForSharing(buildDiscordMessage(plan), "Discord-style message copied.");
}

function sharePlanByEmail() {
  const plan = getShareablePlan();
  if (!plan) return;
  const subject = encodeURIComponent("My Weekly Meal Plan");
  const body = encodeURIComponent(buildPlanSummaryText(plan));
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
  showSuccess("share-panel-alert", "Email sharing opened. If no email app opens, use Copy Plan Summary instead.");
}

function copyShareLink() {
  const plan = getShareablePlan();
  if (!plan) return;
  copyTextForSharing(buildShareLink(plan), "Read-only share link copied.");
}

// Backwards-compatible alias for the old button name.
function generateShareLink() {
  openSharePanel();
}

function loadSharedPlan() {
  const params = new URLSearchParams(window.location.search);
  const shared = params.get("shared");
  if (!shared) return false;

  try {
    const plan = decodeSharePlan(shared);
    sessionStorage.removeItem("mealapp_session");
    updateCurrentUserLabels("Shared View");
    setSharedPlanMode(true);
    showView("dashboard");
    renderMealPlan(plan);
    showSuccess("dashboard-alert", "Shared meal plan loaded in read-only mode.");
    return true;
  } catch (error) {
    console.error("Invalid shared meal plan link", error);
    showView("login");
    showError("login-error", "The shared meal plan link is invalid or incomplete.");
    return false;
  }
}

// ==================== View Management ====================

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const view = document.getElementById(name + "-view");
  if (view) view.classList.add("active");
  clearMessages();
}

function clearMessages() {
  document.querySelectorAll(".error-msg, .success-msg").forEach((el) => {
    el.classList.remove("show");
    el.textContent = "";
  });
}

function showError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
}

function showSuccess(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
}

function requireLogin() {
  const username = getCurrentUser();
  if (!username) {
    showView("login");
    return null;
  }
  updateCurrentUserLabels(username);
  return username;
}

function openDashboard() {
  const username = requireLogin();
  if (!username) return;
  setSharedPlanMode(false);
  enterDashboard(username);
}

function openProfile() {
  if (!requireLogin()) return;
  loadProfile();
  showView("profile");
}

function openPreferences() {
  if (!requireLogin()) return;
  loadPreferences();
  showView("preferences");
}

function openRecipes() {
  if (!requireLogin()) return;
  resetRecipeForm();
  showView("recipes");
  renderRecipeLibrary();
}

function openShoppingList() {
  if (!requireLogin()) return;
  showView("shopping");
  populateShoppingCategoryFilter();
  renderShoppingList();
}

function openPrepSchedule() {
  if (!requireLogin()) return;
  showView("prep");
  renderPrepSchedule();
}

// ==================== Registration / Login ====================

async function handleRegister() {
  clearMessages();

  const username = document.getElementById("reg-user").value.trim();
  const password = document.getElementById("reg-pass").value;
  const confirm = document.getElementById("reg-confirm").value;

  if (!username || !password || !confirm) {
    showError("register-error", "Please fill in all fields.");
    return;
  }

  if (username.length < 3) {
    showError("register-error", "Username must be at least 3 characters.");
    return;
  }

  if (password.length < 6) {
    showError("register-error", "Password must be at least 6 characters.");
    return;
  }

  if (password !== confirm) {
    showError("register-error", "Passwords do not match.");
    return;
  }

  const users = getUsers();
  if (users[username]) {
    showError("register-error", "That username is already taken.");
    return;
  }

  users[username] = {
    role: "user",
    passwordHash: await hashPassword(password),
    profile: {
      displayName: username,
      age: "",
      calorieTarget: "",
      weeklyBudget: "",
    },
    preferences: {
      dietary: [],
      allergies: [],
    },
    settings: {
      measurementUnit: "metric",
      servingSize: 1,
    },
    mealPlans: {},
    customRecipes: [],
    prepTasks: [],
    hiddenPrepTaskIds: [],
    createdAt: new Date().toISOString(),
  };

  saveUsers(users);
  document.getElementById("register-form").reset();
  showSuccess("register-success", "Account created! You can now log in.");
  setTimeout(() => showView("login"), 1200);
}

async function handleLogin() {
  clearMessages();

  const username = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;

  if (!username || !password) {
    showError("login-error", "Please enter your username and password.");
    return;
  }

  const users = getUsers();
  const user = users[username];

  if (!user) {
    showError("login-error", "No account found with that username.");
    return;
  }

  const inputHash = await hashPassword(password);
  if (user.passwordHash !== inputHash) {
    showError("login-error", "Incorrect password.");
    return;
  }

  ensureUserShape(user, username);
  saveUsers(users);
  sessionStorage.setItem("mealapp_session", username);
  document.getElementById("login-form").reset();
  enterDashboard(username);
}

function handleLogout() {
  sessionStorage.removeItem("mealapp_session");
  setSharedPlanMode(false);
  showView("login");
}

// ==================== Profile / Preferences ====================

function loadProfile() {
  const username = getCurrentUser();
  const user = getCurrentUserData();
  const profile = user?.profile || {};

  document.getElementById("profile-name").value = profile.displayName || username || "";
  document.getElementById("profile-age").value = profile.age || "";
  document.getElementById("profile-calories").value = profile.calorieTarget || "";
  document.getElementById("profile-budget").value = profile.weeklyBudget || "";
}

function saveProfile() {
  clearMessages();

  const profile = {
    displayName: document.getElementById("profile-name").value.trim(),
    age: document.getElementById("profile-age").value,
    calorieTarget: document.getElementById("profile-calories").value,
    weeklyBudget: document.getElementById("profile-budget").value,
  };

  if (!profile.displayName) {
    showError("profile-error", "Please enter a display name.");
    return;
  }

  const saved = saveCurrentUserData((user) => {
    user.profile = profile;
  });

  if (saved) showSuccess("profile-success", "Profile saved successfully.");
  else showError("profile-error", "Please log in before saving your profile.");
}

function loadPreferences() {
  const user = getCurrentUserData();
  const preferences = user?.preferences || { dietary: [], allergies: [] };
  setCheckedValues("dietary", preferences.dietary || []);
  setCheckedValues("allergy", preferences.allergies || []);
}

function savePreferences() {
  clearMessages();

  const preferences = {
    dietary: getCheckedValues("dietary"),
    allergies: getCheckedValues("allergy"),
  };

  const saved = saveCurrentUserData((user) => {
    user.preferences = preferences;
  });

  if (saved) showSuccess("preferences-success", "Preferences saved successfully.");
  else showError("preferences-error", "Please log in before saving preferences.");
}

// ==================== Meal Database ====================

const MEALS = {
  breakfast: [
    {
      id: "base-b01",
      type: "breakfast",
      name: "Oatmeal with berries and honey",
      cost: 2.8,
      calories: 430,
      prepMinutes: 10,
      allergens: ["gluten"],
      dietaryTags: ["vegetarian"],
      ingredients: [
        { name: "rolled oats", qty: 0.5, unit: "cup", category: "Grains" },
        { name: "mixed berries", qty: 0.5, unit: "cup", category: "Fruit" },
        { name: "honey", qty: 1, unit: "tbsp", category: "Pantry" },
        { name: "milk", qty: 0.5, unit: "cup", category: "Dairy" },
      ],
    },
    {
      id: "base-b02",
      type: "breakfast",
      name: "Scrambled eggs with toast",
      cost: 3.7,
      calories: 480,
      prepMinutes: 12,
      allergens: ["egg", "gluten", "dairy"],
      dietaryTags: ["vegetarian", "high-protein"],
      ingredients: [
        { name: "eggs", qty: 2, unit: "pcs", category: "Protein" },
        { name: "wholemeal bread", qty: 2, unit: "slices", category: "Bakery" },
        { name: "butter", qty: 1, unit: "tsp", category: "Dairy" },
        { name: "spinach", qty: 0.5, unit: "cup", category: "Vegetables" },
      ],
    },
    {
      id: "base-b03",
      type: "breakfast",
      name: "Greek yogurt parfait with granola",
      cost: 4.2,
      calories: 390,
      prepMinutes: 8,
      allergens: ["dairy", "gluten"],
      dietaryTags: ["vegetarian", "high-protein"],
      ingredients: [
        { name: "greek yogurt", qty: 1, unit: "cup", category: "Dairy" },
        { name: "granola", qty: 0.3, unit: "cup", category: "Grains" },
        { name: "banana", qty: 1, unit: "pcs", category: "Fruit" },
        { name: "honey", qty: 1, unit: "tsp", category: "Pantry" },
      ],
    },
    {
      id: "base-b04",
      type: "breakfast",
      name: "Smoothie bowl with mixed fruits",
      cost: 5.2,
      calories: 460,
      prepMinutes: 10,
      allergens: [],
      dietaryTags: ["vegetarian"],
      ingredients: [
        { name: "banana", qty: 1, unit: "pcs", category: "Fruit" },
        { name: "frozen mango", qty: 0.5, unit: "cup", category: "Frozen" },
        { name: "mixed berries", qty: 0.5, unit: "cup", category: "Fruit" },
        { name: "chia seeds", qty: 1, unit: "tbsp", category: "Pantry" },
      ],
    },
    {
      id: "base-b05",
      type: "breakfast",
      name: "Chia seed pudding with mango",
      cost: 3.9,
      calories: 360,
      prepMinutes: 8,
      allergens: [],
      dietaryTags: ["vegetarian", "low-carb"],
      ingredients: [
        { name: "chia seeds", qty: 3, unit: "tbsp", category: "Pantry" },
        { name: "coconut milk", qty: 0.5, unit: "cup", category: "Pantry" },
        { name: "mango", qty: 0.5, unit: "cup", category: "Fruit" },
        { name: "maple syrup", qty: 1, unit: "tsp", category: "Pantry" },
      ],
    },
    {
      id: "base-b06",
      type: "breakfast",
      name: "Veggie omelette with cheese",
      cost: 4.6,
      calories: 450,
      prepMinutes: 15,
      allergens: ["egg", "dairy"],
      dietaryTags: ["vegetarian", "high-protein", "low-carb"],
      ingredients: [
        { name: "eggs", qty: 2, unit: "pcs", category: "Protein" },
        { name: "cheese", qty: 0.25, unit: "cup", category: "Dairy" },
        { name: "capsicum", qty: 0.5, unit: "pcs", category: "Vegetables" },
        { name: "mushrooms", qty: 0.5, unit: "cup", category: "Vegetables" },
      ],
    },
    {
      id: "base-b07",
      type: "breakfast",
      name: "Avocado toast with poached egg",
      cost: 4.8,
      calories: 510,
      prepMinutes: 15,
      allergens: ["egg", "gluten"],
      dietaryTags: ["vegetarian"],
      ingredients: [
        { name: "avocado", qty: 0.5, unit: "pcs", category: "Vegetables" },
        { name: "wholemeal bread", qty: 2, unit: "slices", category: "Bakery" },
        { name: "eggs", qty: 1, unit: "pcs", category: "Protein" },
        { name: "lemon", qty: 0.25, unit: "pcs", category: "Fruit" },
      ],
    },
    {
      id: "base-b08",
      type: "breakfast",
      name: "Tofu breakfast scramble",
      cost: 4.1,
      calories: 410,
      prepMinutes: 15,
      allergens: ["soy"],
      dietaryTags: ["vegetarian", "high-protein", "low-carb"],
      ingredients: [
        { name: "firm tofu", qty: 150, unit: "g", category: "Protein" },
        { name: "spinach", qty: 1, unit: "cup", category: "Vegetables" },
        { name: "turmeric", qty: 0.5, unit: "tsp", category: "Pantry" },
        { name: "tomato", qty: 1, unit: "pcs", category: "Vegetables" },
      ],
    },
  ],
  lunch: [
    {
      id: "base-l01",
      type: "lunch",
      name: "Chicken salad wrap",
      cost: 6.2,
      calories: 560,
      prepMinutes: 18,
      allergens: ["gluten", "dairy"],
      dietaryTags: ["high-protein"],
      ingredients: [
        { name: "chicken breast", qty: 120, unit: "g", category: "Protein" },
        { name: "wrap", qty: 1, unit: "pcs", category: "Bakery" },
        { name: "lettuce", qty: 1, unit: "cup", category: "Vegetables" },
        { name: "yogurt dressing", qty: 2, unit: "tbsp", category: "Dairy" },
      ],
    },
    {
      id: "base-l02",
      type: "lunch",
      name: "Tuna rice bowl",
      cost: 5.8,
      calories: 590,
      prepMinutes: 15,
      allergens: ["seafood", "soy"],
      dietaryTags: ["high-protein"],
      ingredients: [
        { name: "tuna", qty: 1, unit: "can", category: "Protein" },
        { name: "rice", qty: 1, unit: "cup", category: "Grains" },
        { name: "cucumber", qty: 0.5, unit: "pcs", category: "Vegetables" },
        { name: "soy sauce", qty: 1, unit: "tbsp", category: "Pantry" },
      ],
    },
    {
      id: "base-l03",
      type: "lunch",
      name: "Vegetarian quinoa bowl",
      cost: 6.0,
      calories: 520,
      prepMinutes: 25,
      allergens: [],
      dietaryTags: ["vegetarian", "high-protein"],
      ingredients: [
        { name: "quinoa", qty: 1, unit: "cup", category: "Grains" },
        { name: "chickpeas", qty: 0.75, unit: "cup", category: "Protein" },
        { name: "cucumber", qty: 0.5, unit: "pcs", category: "Vegetables" },
        { name: "feta", qty: 0.25, unit: "cup", category: "Dairy" },
      ],
    },
    {
      id: "base-l04",
      type: "lunch",
      name: "Turkey sandwich with salad",
      cost: 5.5,
      calories: 540,
      prepMinutes: 12,
      allergens: ["gluten"],
      dietaryTags: ["high-protein"],
      ingredients: [
        { name: "turkey slices", qty: 100, unit: "g", category: "Protein" },
        { name: "wholemeal bread", qty: 2, unit: "slices", category: "Bakery" },
        { name: "lettuce", qty: 1, unit: "cup", category: "Vegetables" },
        { name: "tomato", qty: 1, unit: "pcs", category: "Vegetables" },
      ],
    },
    {
      id: "base-l05",
      type: "lunch",
      name: "Lentil soup with wholegrain bread",
      cost: 4.6,
      calories: 500,
      prepMinutes: 30,
      allergens: ["gluten"],
      dietaryTags: ["vegetarian", "high-protein"],
      ingredients: [
        { name: "lentils", qty: 1, unit: "cup", category: "Protein" },
        { name: "carrot", qty: 1, unit: "pcs", category: "Vegetables" },
        { name: "onion", qty: 0.5, unit: "pcs", category: "Vegetables" },
        { name: "wholemeal bread", qty: 1, unit: "slice", category: "Bakery" },
      ],
    },
    {
      id: "base-l06",
      type: "lunch",
      name: "Beef burrito bowl",
      cost: 7.4,
      calories: 690,
      prepMinutes: 28,
      allergens: [],
      dietaryTags: ["high-protein"],
      spicy: true,
      ingredients: [
        { name: "lean beef mince", qty: 120, unit: "g", category: "Protein" },
        { name: "rice", qty: 1, unit: "cup", category: "Grains" },
        { name: "black beans", qty: 0.5, unit: "cup", category: "Protein" },
        { name: "salsa", qty: 2, unit: "tbsp", category: "Pantry" },
      ],
    },
    {
      id: "base-l07",
      type: "lunch",
      name: "Egg and avocado salad box",
      cost: 5.3,
      calories: 480,
      prepMinutes: 15,
      allergens: ["egg"],
      dietaryTags: ["vegetarian", "high-protein", "low-carb"],
      ingredients: [
        { name: "eggs", qty: 2, unit: "pcs", category: "Protein" },
        { name: "avocado", qty: 0.5, unit: "pcs", category: "Vegetables" },
        { name: "lettuce", qty: 1, unit: "cup", category: "Vegetables" },
        { name: "cherry tomatoes", qty: 0.5, unit: "cup", category: "Vegetables" },
      ],
    },
    {
      id: "base-l08",
      type: "lunch",
      name: "Falafel pita pocket",
      cost: 5.9,
      calories: 620,
      prepMinutes: 20,
      allergens: ["gluten", "sesame"],
      dietaryTags: ["vegetarian"],
      ingredients: [
        { name: "falafel", qty: 4, unit: "pcs", category: "Protein" },
        { name: "pita bread", qty: 1, unit: "pcs", category: "Bakery" },
        { name: "lettuce", qty: 1, unit: "cup", category: "Vegetables" },
        { name: "hummus", qty: 2, unit: "tbsp", category: "Pantry" },
      ],
    },
  ],
  dinner: [
    {
      id: "base-d01",
      type: "dinner",
      name: "Grilled chicken with rice and broccoli",
      cost: 8.2,
      calories: 720,
      prepMinutes: 35,
      allergens: [],
      dietaryTags: ["high-protein"],
      ingredients: [
        { name: "chicken breast", qty: 180, unit: "g", category: "Protein" },
        { name: "rice", qty: 1, unit: "cup", category: "Grains" },
        { name: "broccoli", qty: 1, unit: "cup", category: "Vegetables" },
        { name: "olive oil", qty: 1, unit: "tbsp", category: "Pantry" },
      ],
    },
    {
      id: "base-d02",
      type: "dinner",
      name: "Salmon with potatoes and green beans",
      cost: 10.4,
      calories: 760,
      prepMinutes: 35,
      allergens: ["seafood"],
      dietaryTags: ["high-protein"],
      ingredients: [
        { name: "salmon fillet", qty: 180, unit: "g", category: "Protein" },
        { name: "potatoes", qty: 2, unit: "pcs", category: "Vegetables" },
        { name: "green beans", qty: 1, unit: "cup", category: "Vegetables" },
        { name: "lemon", qty: 0.5, unit: "pcs", category: "Fruit" },
      ],
    },
    {
      id: "base-d03",
      type: "dinner",
      name: "Beef stir fry with noodles",
      cost: 8.8,
      calories: 810,
      prepMinutes: 30,
      allergens: ["gluten", "soy"],
      dietaryTags: ["high-protein"],
      ingredients: [
        { name: "beef strips", qty: 160, unit: "g", category: "Protein" },
        { name: "egg noodles", qty: 1, unit: "serve", category: "Grains" },
        { name: "mixed vegetables", qty: 1, unit: "cup", category: "Frozen" },
        { name: "soy sauce", qty: 1, unit: "tbsp", category: "Pantry" },
      ],
    },
    {
      id: "base-d04",
      type: "dinner",
      name: "Vegetable curry with rice",
      cost: 6.9,
      calories: 680,
      prepMinutes: 35,
      allergens: [],
      dietaryTags: ["vegetarian"],
      spicy: true,
      ingredients: [
        { name: "mixed vegetables", qty: 1.5, unit: "cup", category: "Frozen" },
        { name: "coconut milk", qty: 0.5, unit: "cup", category: "Pantry" },
        { name: "rice", qty: 1, unit: "cup", category: "Grains" },
        { name: "curry paste", qty: 1, unit: "tbsp", category: "Pantry" },
      ],
    },
    {
      id: "base-d05",
      type: "dinner",
      name: "Turkey meatballs with pasta",
      cost: 7.5,
      calories: 750,
      prepMinutes: 40,
      allergens: ["gluten", "egg"],
      dietaryTags: ["high-protein"],
      ingredients: [
        { name: "turkey mince", qty: 160, unit: "g", category: "Protein" },
        { name: "pasta", qty: 1, unit: "serve", category: "Grains" },
        { name: "tomato sauce", qty: 0.5, unit: "cup", category: "Pantry" },
        { name: "egg", qty: 0.5, unit: "pcs", category: "Protein" },
      ],
    },
    {
      id: "base-d06",
      type: "dinner",
      name: "Tofu veggie stir fry",
      cost: 6.4,
      calories: 610,
      prepMinutes: 25,
      allergens: ["soy"],
      dietaryTags: ["vegetarian", "high-protein", "low-carb"],
      ingredients: [
        { name: "firm tofu", qty: 180, unit: "g", category: "Protein" },
        { name: "broccoli", qty: 1, unit: "cup", category: "Vegetables" },
        { name: "capsicum", qty: 1, unit: "pcs", category: "Vegetables" },
        { name: "soy sauce", qty: 1, unit: "tbsp", category: "Pantry" },
      ],
    },
    {
      id: "base-d07",
      type: "dinner",
      name: "Chickpea tomato stew",
      cost: 5.6,
      calories: 590,
      prepMinutes: 30,
      allergens: [],
      dietaryTags: ["vegetarian", "high-protein"],
      ingredients: [
        { name: "chickpeas", qty: 1, unit: "cup", category: "Protein" },
        { name: "tomato sauce", qty: 1, unit: "cup", category: "Pantry" },
        { name: "spinach", qty: 1, unit: "cup", category: "Vegetables" },
        { name: "onion", qty: 0.5, unit: "pcs", category: "Vegetables" },
      ],
    },
    {
      id: "base-d08",
      type: "dinner",
      name: "Low-carb chicken lettuce cups",
      cost: 7.9,
      calories: 540,
      prepMinutes: 25,
      allergens: ["soy"],
      dietaryTags: ["high-protein", "low-carb"],
      ingredients: [
        { name: "chicken mince", qty: 160, unit: "g", category: "Protein" },
        { name: "lettuce", qty: 6, unit: "leaves", category: "Vegetables" },
        { name: "carrot", qty: 0.5, unit: "pcs", category: "Vegetables" },
        { name: "soy sauce", qty: 1, unit: "tbsp", category: "Pantry" },
      ],
    },
  ],
  snack: [
    {
      id: "base-s01",
      type: "snack",
      name: "Apple slices with peanut butter",
      cost: 2.2,
      calories: 260,
      prepMinutes: 5,
      allergens: ["peanuts"],
      dietaryTags: ["vegetarian"],
      ingredients: [
        { name: "apple", qty: 1, unit: "pcs", category: "Fruit" },
        { name: "peanut butter", qty: 1, unit: "tbsp", category: "Pantry" },
      ],
    },
    {
      id: "base-s02",
      type: "snack",
      name: "Carrot sticks with hummus",
      cost: 2.4,
      calories: 210,
      prepMinutes: 6,
      allergens: ["sesame"],
      dietaryTags: ["vegetarian", "low-carb"],
      ingredients: [
        { name: "carrot", qty: 1, unit: "pcs", category: "Vegetables" },
        { name: "hummus", qty: 2, unit: "tbsp", category: "Pantry" },
      ],
    },
    {
      id: "base-s03",
      type: "snack",
      name: "Greek yogurt with honey",
      cost: 2.6,
      calories: 230,
      prepMinutes: 3,
      allergens: ["dairy"],
      dietaryTags: ["vegetarian", "high-protein"],
      ingredients: [
        { name: "greek yogurt", qty: 0.75, unit: "cup", category: "Dairy" },
        { name: "honey", qty: 1, unit: "tsp", category: "Pantry" },
      ],
    },
    {
      id: "base-s04",
      type: "snack",
      name: "Boiled eggs and cherry tomatoes",
      cost: 2.7,
      calories: 250,
      prepMinutes: 12,
      allergens: ["egg"],
      dietaryTags: ["vegetarian", "high-protein", "low-carb"],
      ingredients: [
        { name: "eggs", qty: 2, unit: "pcs", category: "Protein" },
        { name: "cherry tomatoes", qty: 0.5, unit: "cup", category: "Vegetables" },
      ],
    },
    {
      id: "base-s05",
      type: "snack",
      name: "Trail mix snack pack",
      cost: 3.1,
      calories: 300,
      prepMinutes: 2,
      allergens: ["tree-nuts"],
      dietaryTags: ["vegetarian"],
      ingredients: [
        { name: "mixed nuts", qty: 0.25, unit: "cup", category: "Pantry" },
        { name: "raisins", qty: 2, unit: "tbsp", category: "Fruit" },
      ],
    },
    {
      id: "base-s06",
      type: "snack",
      name: "Protein smoothie",
      cost: 3.6,
      calories: 320,
      prepMinutes: 5,
      allergens: ["dairy"],
      dietaryTags: ["high-protein"],
      ingredients: [
        { name: "milk", qty: 1, unit: "cup", category: "Dairy" },
        { name: "banana", qty: 1, unit: "pcs", category: "Fruit" },
        { name: "protein powder", qty: 1, unit: "scoop", category: "Pantry" },
      ],
    },
    {
      id: "base-s07",
      type: "snack",
      name: "Edamame with sea salt",
      cost: 2.3,
      calories: 220,
      prepMinutes: 6,
      allergens: ["soy"],
      dietaryTags: ["vegetarian", "high-protein"],
      ingredients: [
        { name: "edamame", qty: 1, unit: "cup", category: "Frozen" },
        { name: "sea salt", qty: 1, unit: "pinch", category: "Pantry" },
      ],
    },
    {
      id: "base-s08",
      type: "snack",
      name: "Rice crackers with avocado",
      cost: 2.5,
      calories: 240,
      prepMinutes: 5,
      allergens: [],
      dietaryTags: ["vegetarian"],
      ingredients: [
        { name: "rice crackers", qty: 4, unit: "pcs", category: "Pantry" },
        { name: "avocado", qty: 0.5, unit: "pcs", category: "Vegetables" },
      ],
    },
  ],
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

// ==================== Meal Helpers ====================

function getBaseMeals() {
  return Object.values(MEALS).flat();
}

function getCustomMeals() {
  const user = getCurrentUserData();
  return (user?.customRecipes || []).map((recipe) => ({ ...recipe, isCustom: true }));
}

function getAllMealItems() {
  return [...getBaseMeals(), ...getCustomMeals()];
}

function getMealsByType(type) {
  return getAllMealItems().filter((meal) => meal.type === type);
}

function resolveMeal(mealRef) {
  if (!mealRef) {
    return { name: "Unknown meal", type: "", cost: 0, calories: 0, prepMinutes: 0, allergens: [], dietaryTags: [], ingredients: [] };
  }

  const allMeals = getAllMealItems();
  if (typeof mealRef === "string") {
    return allMeals.find((meal) => meal.id === mealRef || meal.name === mealRef) || {
      id: mealRef,
      name: mealRef,
      type: "",
      cost: 0,
      calories: 0,
      prepMinutes: 0,
      allergens: [],
      dietaryTags: [],
      ingredients: [],
    };
  }

  const savedMeal = allMeals.find((meal) => meal.id === mealRef.id || meal.name === mealRef.name);
  const mergedMeal = {
    ...(savedMeal || {}),
    ...mealRef,
    cost: Number(mealRef.cost ?? savedMeal?.cost ?? 0),
    calories: Number(mealRef.calories ?? savedMeal?.calories ?? 0),
    prepMinutes: Number(mealRef.prepMinutes ?? savedMeal?.prepMinutes ?? 0),
    allergens: mealRef.allergens || savedMeal?.allergens || [],
    dietaryTags: mealRef.dietaryTags || savedMeal?.dietaryTags || [],
    ingredients: mealRef.ingredients || savedMeal?.ingredients || [],
  };
  mergedMeal.ingredients = mergedMeal.ingredients.map(normaliseIngredientWeight);
  mergedMeal.portionGrams = getMealPortionGrams(mergedMeal);
  mergedMeal.baseServings = Number(mergedMeal.baseServings || 1);
  return mergedMeal;
}

function mealMatchesPreferences(meal, preferences, safeOnly = true) {
  if (!safeOnly) return true;

  const allergies = preferences?.allergies || [];
  const dietary = preferences?.dietary || [];

  const mealAllergens = meal.allergens || [];
  const mealTags = meal.dietaryTags || [];
  const hasBlockedAllergen = allergies.some((allergy) => mealAllergens.includes(allergy));
  if (hasBlockedAllergen) return false;

  if (dietary.includes("vegetarian") && !mealTags.includes("vegetarian")) return false;
  if (dietary.includes("high-protein") && !mealTags.includes("high-protein")) return false;
  if (dietary.includes("low-carb") && !mealTags.includes("low-carb")) return false;
  if (dietary.includes("no-spicy") && meal.spicy) return false;

  return true;
}

function getFilteredMeals(type, preferences) {
  const meals = getMealsByType(type);
  const strict = meals.filter((meal) => mealMatchesPreferences(meal, preferences, true));
  if (strict.length > 0) return strict;

  // Allergy safety is treated as the must-have rule. Dietary tags can be loosened if too strict.
  const allergies = preferences?.allergies || [];
  return meals.filter((meal) => !allergies.some((allergy) => (meal.allergens || []).includes(allergy)));
}

function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function repeatToCount(arr, count) {
  const result = [];
  const shuffled = pickRandom(arr, arr.length);
  for (let i = 0; i < count; i += 1) result.push(shuffled[i % shuffled.length]);
  return result;
}

function cloneMealForPlan(meal) {
  return { id: meal.id, name: meal.name, type: meal.type, completed: false };
}

function getCurrentPlan() {
  const user = getCurrentUserData();
  return user?.mealPlans?.current || null;
}

function saveCurrentPlan(plan) {
  saveCurrentUserData((user) => {
    user.mealPlans = user.mealPlans || {};
    user.mealPlans.current = plan;
    user.mealPlans.generatedAt = new Date().toISOString();
  });
}

function calculatePlanSummary(plan) {
  const servingSize = getServingSize();
  let totalCost = 0;
  let totalCalories = 0;
  let totalPrepMinutes = 0;
  let totalPortionGrams = 0;
  let mealCount = 0;
  let completedCount = 0;

  DAYS.forEach((day) => {
    const meals = plan?.[day] || {};
    MEAL_TYPES.forEach((type) => {
      const mealRef = meals[type];
      const meal = resolveMeal(mealRef);
      totalCost += Number(meal.cost || 0) * servingSize;
      totalCalories += Number(meal.calories || 0) * servingSize;
      totalPrepMinutes += Number(meal.prepMinutes || 0);
      totalPortionGrams += getMealPortionGrams(meal) * servingSize;
      mealCount += 1;
      if (isMealCompleted(mealRef)) completedCount += 1;
    });
  });

  return {
    totalCost,
    totalCalories,
    totalPrepMinutes,
    totalPortionGrams,
    mealCount,
    completedCount,
    completionPercent: mealCount ? Math.round((completedCount / mealCount) * 100) : 0,
    servingSize,
    dailyAverageCalories: totalCalories / DAYS.length,
    dailyAveragePrep: totalPrepMinutes / DAYS.length,
  };
}
function getCurrentSettings() {
  const user = getCurrentUserData();
  const settings = user?.settings || {};
  return {
    measurementUnit: settings.measurementUnit || "metric",
    servingSize: normaliseServingSize(settings.servingSize || 1),
  };
}

function normaliseServingSize(value) {
  const number = Number(value || 1);
  if (!Number.isFinite(number)) return 1;
  return Math.min(6, Math.max(0.5, Number(number.toFixed(1))));
}

function getServingSize() {
  return getCurrentSettings().servingSize;
}

function getMeasurementUnit() {
  return getCurrentSettings().measurementUnit;
}

function savePlannerSetting(key, value) {
  return saveCurrentUserData((user) => {
    user.settings = user.settings || {};
    user.settings[key] = value;
  });
}

function isMealCompleted(mealRef) {
  return Boolean(mealRef && typeof mealRef === "object" && mealRef.completed);
}

function refreshCurrentPlanView(successMessage = "") {
  const plan = getCurrentPlan();
  if (plan) renderMealPlan(plan);
  else updateSprintFeaturePanel(null);
  const activeView = document.querySelector(".view.active")?.id;
  if (activeView === "shopping-view") renderShoppingList();
  if (activeView === "prep-view") renderPrepSchedule();
  if (successMessage) showSuccess("dashboard-alert", successMessage);
}

function setMeasurementUnit() {
  const select = document.getElementById("unit-switch-select");
  if (!select) return;
  const saved = savePlannerSetting("measurementUnit", select.value || "metric");
  if (saved) refreshCurrentPlanView("Measurement unit updated for the planner and shopping list.");
}

function applyServingSize() {
  const input = document.getElementById("serving-size-input");
  if (!input) return;
  const servingSize = normaliseServingSize(input.value);
  input.value = String(servingSize);
  const saved = savePlannerSetting("servingSize", servingSize);
  if (saved) refreshCurrentPlanView("Serving size updated. Cost, calories, and shopping quantities were recalculated.");
}

function adjustServingSize(change) {
  const input = document.getElementById("serving-size-input");
  if (!input) return;
  input.value = String(normaliseServingSize(Number(input.value || getServingSize()) + change));
  applyServingSize();
}

function toggleMealCompletion(day, type) {
  const plan = getCurrentPlan();
  if (!plan?.[day]?.[type]) return;

  const existingMeal = plan[day][type];
  if (typeof existingMeal === "string") {
    const resolvedMeal = resolveMeal(existingMeal);
    plan[day][type] = cloneMealForPlan(resolvedMeal);
  }

  plan[day][type].completed = !Boolean(plan[day][type].completed);
  saveCurrentPlan(plan);
  renderMealPlan(plan);
  showSuccess("dashboard-alert", `${day} ${toTitleCase(type)} marked as ${plan[day][type].completed ? "completed" : "not completed"}.`);
}

function resetMealCompletion() {
  const plan = getCurrentPlan();
  if (!plan) return;
  DAYS.forEach((day) => {
    MEAL_TYPES.forEach((type) => {
      if (plan[day]?.[type] && typeof plan[day][type] === "object") {
        plan[day][type].completed = false;
      }
    });
  });
  saveCurrentPlan(plan);
  renderMealPlan(plan);
  showSuccess("dashboard-alert", "Meal completion tracking has been reset for this weekly plan.");
}

function updateSprintFeaturePanel(plan) {
  const settings = getCurrentSettings();
  const unitSelect = document.getElementById("unit-switch-select");
  const servingInput = document.getElementById("serving-size-input");
  const completionText = document.getElementById("completion-progress-text");
  const completionBar = document.getElementById("completion-progress-bar");
  const completionReset = document.getElementById("completion-reset-btn");

  if (unitSelect) unitSelect.value = settings.measurementUnit;
  if (servingInput) servingInput.value = String(settings.servingSize);

  const summary = plan ? calculatePlanSummary(plan) : { completedCount: 0, mealCount: DAYS.length * MEAL_TYPES.length, completionPercent: 0 };
  if (completionText) completionText.textContent = `${summary.completedCount}/${summary.mealCount} meals completed`;
  if (completionBar) completionBar.style.width = `${summary.completionPercent}%`;
  if (completionReset) completionReset.disabled = !plan || summary.completedCount === 0;
}

function getScaledMealCost(meal) {
  return Number(meal.cost || 0) * getServingSize();
}

function getScaledMealCalories(meal) {
  return Number(meal.calories || 0) * getServingSize();
}

function formatIngredientQuantity(qty, unit, gramsPerUnit = 0) {
  const grams = Number(qty || 0) * Number(gramsPerUnit || UNIT_GRAMS[normaliseUnitName(unit)] || 100) * getServingSize();
  return formatWeightFromGrams(grams);
}

function formatShoppingQuantity(grams) {
  return formatWeightFromGrams(grams);
}

function formatBaseIngredientNote(item) {
  const sourceQty = formatNumber(item.baseQty ?? item.qty ?? 0);
  const sourceUnit = item.originalUnit || item.unit || "unit";
  const grams = formatNumber(item.baseGrams || 0);
  return `${sourceQty} ${sourceUnit} ≈ ${grams} g per serving`;
}

function getBudgetStatus(totalCost, weeklyBudget) {
  const budget = Number(weeklyBudget || 0);
  if (!budget) return "No weekly budget set";
  const difference = budget - totalCost;
  if (difference >= 0) return `Within budget by ${formatMoney(difference)}`;
  return `Over budget by ${formatMoney(Math.abs(difference))}`;
}

function getCalorieStatus(dailyAverage, calorieTarget) {
  const target = Number(calorieTarget || 0);
  if (!target) return "No calorie target set";
  const difference = dailyAverage - target;
  const percent = Math.abs(difference) / target;
  if (percent <= 0.1) return "Close to your daily target";
  if (difference > 0) return `Above target by about ${formatCalories(difference)} per day`;
  return `Below target by about ${formatCalories(Math.abs(difference))} per day`;
}

function getHealthSuggestions(plan) {
  const user = getCurrentUserData();
  const profile = user?.profile || {};
  const summary = calculatePlanSummary(plan);
  const suggestions = [];
  const calorieTarget = Number(profile.calorieTarget || 0);
  const weeklyBudget = Number(profile.weeklyBudget || 0);

  if (weeklyBudget && summary.totalCost > weeklyBudget) {
    suggestions.push(`Budget suggestion: reduce or replace meals to bring the plan back within the weekly budget. Current plan is ${formatMoney(summary.totalCost - weeklyBudget)} over.`);
  }

  if (calorieTarget && Math.abs(summary.dailyAverageCalories - calorieTarget) / calorieTarget > 0.1) {
    suggestions.push(`Calorie suggestion: adjust meal choices because the daily average is not close to your target.`);
  }

  const vegetarianMeals = [];
  const highProteinMeals = [];
  DAYS.forEach((day) => {
    MEAL_TYPES.forEach((type) => {
      const meal = resolveMeal(plan[day][type]);
      if ((meal.dietaryTags || []).includes("vegetarian")) vegetarianMeals.push(meal);
      if ((meal.dietaryTags || []).includes("high-protein")) highProteinMeals.push(meal);
    });
  });

  if (highProteinMeals.length < 7) {
    suggestions.push("Balance suggestion: add more high-protein meals if this week needs better protein coverage.");
  }
  if (vegetarianMeals.length < 4) {
    suggestions.push("Balance suggestion: add more vegetable-focused meals to improve variety.");
  }

  return suggestions;
}

// ==================== Meal Plan Generation / Dashboard ====================

function updateCurrentUserLabels(username) {
  document.querySelectorAll("[data-current-user]").forEach((el) => {
    el.textContent = username || "Guest";
  });
}

function enterDashboard(username) {
  setSharedPlanMode(false);
  const users = getUsers();
  if (users[username]) {
    ensureUserShape(users[username], username);
    saveUsers(users);
  }
  updateCurrentUserLabels(username);
  showView("dashboard");
  loadSavedPlan(username);
}

function loadSavedPlan(username) {
  const users = getUsers();
  const plan = users[username]?.mealPlans?.current;

  if (plan) renderMealPlan(plan);
  else {
    updateSprintFeaturePanel(null);
    document.getElementById("meal-plan-grid").innerHTML =
      '<p class="empty-state">Click "Generate New Plan" to create your weekly meal plan.</p>';
  }
}

function generateMealPlan() {
  setSharedPlanMode(false);
  const username = getCurrentUser();
  const users = getUsers();
  const preferences = username ? users[username]?.preferences || { dietary: [], allergies: [] } : { dietary: [], allergies: [] };

  const available = {
    breakfast: getFilteredMeals("breakfast", preferences),
    lunch: getFilteredMeals("lunch", preferences),
    dinner: getFilteredMeals("dinner", preferences),
    snack: getFilteredMeals("snack", preferences),
  };

  if (MEAL_TYPES.some((type) => available[type].length === 0)) {
    document.getElementById("meal-plan-grid").innerHTML =
      '<p class="empty-state">No safe meal plan could be generated with the selected allergy settings. Please update My Preferences.</p>';
    return;
  }

  const breakfasts = repeatToCount(available.breakfast, 7);
  const lunches = repeatToCount(available.lunch, 7);
  const dinners = repeatToCount(available.dinner, 7);
  const snacks = repeatToCount(available.snack, 7);
  const plan = {};

  DAYS.forEach((day, i) => {
    plan[day] = {
      breakfast: cloneMealForPlan(breakfasts[i]),
      lunch: cloneMealForPlan(lunches[i]),
      dinner: cloneMealForPlan(dinners[i]),
      snack: cloneMealForPlan(snacks[i]),
    };
  });

  saveCurrentPlan(plan);
  syncPrepTasksWithPlan({ resetAutoTasks: true });
  renderMealPlan(plan);
  showSuccess("dashboard-alert", "New weekly plan generated. You can customise meals, view the shopping list, or check the prep schedule.");
}

function renderMealItem(day, type, label, meal) {
  const resolvedMeal = resolveMeal(meal);
  const allergens = (resolvedMeal.allergens || []).length ? resolvedMeal.allergens.join(", ") : "none";
  const tags = (resolvedMeal.dietaryTags || []).map(toTitleCase).join(", ") || "standard";
  const reviewSummary = getReviewSummary(resolvedMeal.name);
  const safeMealName = escapeHTML(resolvedMeal.name);
  const encodedMealNameForHandler = encodeRecipeNameForHandler(resolvedMeal.name);
  const completed = isMealCompleted(meal);
  const completionButton = viewingSharedPlan
    ? ""
    : `<button class="btn ${completed ? "btn-primary" : "btn-outline"} btn-xs" onclick="toggleMealCompletion('${day}', '${type}')">${completed ? "Completed" : "Mark Done"}</button>`;
  const customiseButton = viewingSharedPlan
    ? ""
    : `<button class="btn btn-outline btn-xs" onclick="openCustomizeModal('${day}', '${type}')">Customise</button>`;
  const reviewButton = getCurrentUser()
    ? `<button class="btn btn-outline btn-xs" onclick="openReviewModalFromEncoded('${encodedMealNameForHandler}')">Review</button>`
    : "";

  return `
    <div class="meal-row ${completed ? "meal-completed" : ""}">
      <span class="meal-label">${escapeHTML(label)}</span>
      <span class="meal-content">
        <span class="meal-name">${safeMealName}</span>
        <span class="meal-meta">${formatMoney(getScaledMealCost(resolvedMeal))} · ${formatCalories(getScaledMealCalories(resolvedMeal))} · ${formatWeightFromGrams(getScaledMealWeightGrams(resolvedMeal))}</span>
        <span class="meal-meta">Base serving: ${formatWeightFromGrams(getMealPortionGrams(resolvedMeal))} × ${formatNumber(getServingSize())} serving${getServingSize() === 1 ? "" : "s"}</span>
        <span class="meal-meta">Tags: ${escapeHTML(tags)} · Allergens: ${escapeHTML(allergens)}</span>
        <span class="meal-meta review-summary">${escapeHTML(reviewSummary)}</span>
      </span>
      <span class="meal-actions">${completionButton}${reviewButton}${customiseButton}</span>
    </div>
  `;
}

function renderSummaryCard(plan) {
  const user = getCurrentUserData();
  const profile = user?.profile || {};
  const summary = calculatePlanSummary(plan);
  const weeklyBudget = Number(profile.weeklyBudget || 0);
  const calorieTarget = Number(profile.calorieTarget || 0);
  const suggestions = getHealthSuggestions(plan);

  const card = document.createElement("div");
  card.className = "day-card summary-card";
  card.innerHTML = `
    <div class="day-card-header">Weekly Summary</div>
    <div class="day-card-body">
      <div class="summary-row"><span class="summary-label">Total Food Cost</span><span class="summary-value">${formatMoney(summary.totalCost)}</span></div>
      <div class="summary-row"><span class="summary-label">Weekly Budget</span><span class="summary-value">${weeklyBudget ? formatMoney(weeklyBudget) : "Not set"}</span></div>
      <p class="summary-status ${weeklyBudget && summary.totalCost > weeklyBudget ? "status-warning" : "status-ok"}">${getBudgetStatus(summary.totalCost, weeklyBudget)}</p>

      <div class="summary-divider"></div>
      <div class="summary-row"><span class="summary-label">Weekly Calories</span><span class="summary-value">${formatCalories(summary.totalCalories)}</span></div>
      <div class="summary-row"><span class="summary-label">Daily Average</span><span class="summary-value">${formatCalories(summary.dailyAverageCalories)}</span></div>
      <div class="summary-row"><span class="summary-label">Daily Target</span><span class="summary-value">${calorieTarget ? formatCalories(calorieTarget) : "Not set"}</span></div>
      <p class="summary-status ${calorieTarget && Math.abs(summary.dailyAverageCalories - calorieTarget) / calorieTarget > 0.1 ? "status-warning" : "status-ok"}">${getCalorieStatus(summary.dailyAverageCalories, calorieTarget)}</p>

      <div class="summary-divider"></div>
      <div class="summary-row"><span class="summary-label">Completed Meals</span><span class="summary-value">${summary.completedCount}/${summary.mealCount}</span></div>
      <div class="summary-row"><span class="summary-label">Serving Size</span><span class="summary-value">x${formatNumber(summary.servingSize)}</span></div>
      <div class="summary-row"><span class="summary-label">Total Food Weight</span><span class="summary-value">${formatWeightFromGrams(summary.totalPortionGrams)}</span></div>
      <div class="summary-row"><span class="summary-label">Ingredient Unit</span><span class="summary-value">${getMeasurementUnitLabel()}</span></div>

      <div class="summary-divider"></div>
      <div class="suggestion-list">
        ${suggestions.length
          ? suggestions.map((suggestion) => `<p class="mini-suggestion">${escapeHTML(suggestion)}</p>`).join("")
          : '<p class="mini-suggestion suggestion-ok">No health suggestion needed. The current plan looks balanced for the basic prototype check.</p>'}
      </div>
      <p class="summary-note">Cost, calories, and health suggestions are estimated for prototype use.</p>
    </div>
  `;
  return card;
}

function renderMealPlan(plan) {
  updateSprintFeaturePanel(plan);
  const grid = document.getElementById("meal-plan-grid");
  grid.innerHTML = "";

  DAYS.forEach((day) => {
    const meals = plan[day];
    const card = document.createElement("div");
    card.className = "day-card";
    card.innerHTML = `
      <div class="day-card-header">${day}</div>
      <div class="day-card-body">
        ${renderMealItem(day, "breakfast", "Breakfast", meals.breakfast)}
        ${renderMealItem(day, "lunch", "Lunch", meals.lunch)}
        ${renderMealItem(day, "dinner", "Dinner", meals.dinner)}
        ${renderMealItem(day, "snack", "Snack", meals.snack)}
      </div>
    `;
    grid.appendChild(card);
  });

  grid.appendChild(renderSummaryCard(plan));
}

// ==================== Meal Plan Customisation ====================

let customizeState = { day: null, type: null };

function openCustomizeModal(day, type) {
  customizeState = { day, type };
  const plan = getCurrentPlan();
  if (!plan) return;

  const currentMeal = resolveMeal(plan[day][type]);
  document.getElementById("customize-context").textContent = `Replacing ${day} ${toTitleCase(type)}: ${currentMeal.name}`;
  document.getElementById("customize-search").value = "";
  document.getElementById("customize-safe-only").checked = true;
  document.getElementById("customize-modal").classList.add("active");
  document.getElementById("customize-modal").setAttribute("aria-hidden", "false");
  renderCustomizeOptions();
}

function closeCustomizeModal() {
  document.getElementById("customize-modal").classList.remove("active");
  document.getElementById("customize-modal").setAttribute("aria-hidden", "true");
}

function mealSearchText(meal) {
  const ingredients = (meal.ingredients || []).map((item) => item.name).join(" ");
  return `${meal.name} ${meal.type} ${(meal.dietaryTags || []).join(" ")} ${(meal.allergens || []).join(" ")} ${ingredients}`.toLowerCase();
}

function renderCustomizeOptions() {
  const list = document.getElementById("customize-options");
  const user = getCurrentUserData();
  const preferences = user?.preferences || { dietary: [], allergies: [] };
  const safeOnly = document.getElementById("customize-safe-only").checked;
  const query = document.getElementById("customize-search").value.trim().toLowerCase();

  let meals = getMealsByType(customizeState.type).filter((meal) => mealMatchesPreferences(meal, preferences, safeOnly));
  if (query) meals = meals.filter((meal) => mealSearchText(meal).includes(query));

  if (meals.length === 0) {
    list.innerHTML = '<p class="empty-state small-empty">No matching recipe found. Try clearing the search or unchecking the preference filter.</p>';
    return;
  }

  list.innerHTML = meals
    .map((meal) => {
      const ingredients = (meal.ingredients || []).slice(0, 4).map((item) => item.name).join(", ");
      const customBadge = meal.isCustom ? '<span class="tag-pill">Custom</span>' : '<span class="tag-pill">Built-in</span>';
      return `
        <div class="recipe-option">
          <div>
            <h3>${escapeHTML(meal.name)} ${customBadge}</h3>
            <p class="meal-meta">${formatMoney(meal.cost)} · ${formatCalories(meal.calories)} · ${formatWeightFromGrams(getMealPortionGrams(meal))} per serving</p>
            <p class="meal-meta">Ingredients: ${escapeHTML(ingredients || "Not listed")}</p>
          </div>
          <button class="btn btn-primary choose-btn" onclick="selectMealForSlot('${meal.id}')">Choose</button>
        </div>
      `;
    })
    .join("");
}

function selectMealForSlot(mealId) {
  const plan = getCurrentPlan();
  const meal = getAllMealItems().find((item) => item.id === mealId);
  if (!plan || !meal || !customizeState.day || !customizeState.type) return;

  plan[customizeState.day][customizeState.type] = cloneMealForPlan(meal);
  saveCurrentPlan(plan);
  syncPrepTasksWithPlan({ resetAutoTasks: false });
  closeCustomizeModal();
  renderMealPlan(plan);
  showSuccess("dashboard-alert", `${customizeState.day} ${toTitleCase(customizeState.type)} updated to ${meal.name}.`);
}

// ==================== Recipe Management ====================

function parseRecipeIngredients(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, qty, unit, category, gramsPerUnit] = line.split(",").map((part) => part.trim());
      const ingredient = {
        name: name || "ingredient",
        qty: Number(qty || 1),
        unit: unit || "unit",
        category: category || "Other",
      };
      if (Number(gramsPerUnit || 0) > 0) ingredient.gramsPerUnit = Number(gramsPerUnit);
      return normaliseIngredientWeight(ingredient);
    });
}

function ingredientsToText(ingredients = []) {
  return ingredients.map((item) => {
    const ingredient = normaliseIngredientWeight(item);
    return `${ingredient.name}, ${ingredient.qty}, ${ingredient.unit}, ${ingredient.category}, ${formatNumber(ingredient.gramsPerUnit)}`;
  }).join("\n");
}

function getSelectedRecipeTags() {
  return Array.from(document.getElementById("recipe-tags").selectedOptions).map((option) => option.value);
}

function setSelectedRecipeTags(tags = []) {
  Array.from(document.getElementById("recipe-tags").options).forEach((option) => {
    option.selected = tags.includes(option.value);
  });
}

function saveCustomRecipe() {
  clearMessages();
  const editId = document.getElementById("recipe-edit-id").value;
  const name = document.getElementById("recipe-name").value.trim();
  const type = document.getElementById("recipe-type").value;
  const cost = Number(document.getElementById("recipe-cost").value || 0);
  const calories = Number(document.getElementById("recipe-calories").value || 0);
  const enteredPortionGrams = Number(document.getElementById("recipe-portion-grams")?.value || 0);
  const allergens = document.getElementById("recipe-allergens").value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const dietaryTags = getSelectedRecipeTags();
  const ingredients = parseRecipeIngredients(document.getElementById("recipe-ingredients").value);

  if (!name || !type || !cost || !calories) {
    showError("recipe-error", "Please enter a recipe name, type, cost, and calories.");
    return;
  }

  const saved = saveCurrentUserData((user) => {
    user.customRecipes = user.customRecipes || [];
    const recipe = {
      id: editId || `custom-${Date.now()}`,
      isCustom: true,
      type,
      name,
      cost,
      calories,
      prepMinutes: 0,
      allergens,
      dietaryTags,
      ingredients,
      portionGrams: enteredPortionGrams > 0 ? enteredPortionGrams : ingredients.reduce((total, item) => total + normaliseIngredientWeight(item).baseGrams, 0),
      baseServings: 1,
    };

    if (editId) {
      const index = user.customRecipes.findIndex((item) => item.id === editId);
      if (index >= 0) user.customRecipes[index] = recipe;
    } else {
      user.customRecipes.push(recipe);
    }
  });

  if (!saved) {
    showError("recipe-error", "Please log in before saving recipes.");
    return;
  }

  showSuccess("recipe-success", editId ? "Custom recipe updated." : "Custom recipe added.");
  resetRecipeForm();
  renderRecipeLibrary();
}

function resetRecipeForm() {
  const ids = ["recipe-edit-id", "recipe-name", "recipe-cost", "recipe-calories", "recipe-portion-grams", "recipe-allergens", "recipe-ingredients"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const type = document.getElementById("recipe-type");
  if (type) type.value = "breakfast";
  if (document.getElementById("recipe-tags")) setSelectedRecipeTags([]);
  const title = document.getElementById("recipe-form-title");
  if (title) title.textContent = "Add Custom Recipe";
}

function editCustomRecipe(recipeId) {
  const recipe = getCustomMeals().find((item) => item.id === recipeId);
  if (!recipe) return;

  document.getElementById("recipe-edit-id").value = recipe.id;
  document.getElementById("recipe-name").value = recipe.name;
  document.getElementById("recipe-type").value = recipe.type;
  document.getElementById("recipe-cost").value = recipe.cost;
  document.getElementById("recipe-calories").value = recipe.calories;
  const portionInput = document.getElementById("recipe-portion-grams");
  if (portionInput) portionInput.value = Math.round(getMealPortionGrams(recipe));
  document.getElementById("recipe-allergens").value = (recipe.allergens || []).join(", ");
  document.getElementById("recipe-ingredients").value = ingredientsToText(recipe.ingredients || []);
  setSelectedRecipeTags(recipe.dietaryTags || []);
  document.getElementById("recipe-form-title").textContent = "Edit Custom Recipe";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteCustomRecipe(recipeId) {
  const user = getCurrentUserData();
  const recipe = (user?.customRecipes || []).find((item) => item.id === recipeId);
  if (!recipe) return;

  const confirmed = confirm(`Delete custom recipe "${recipe.name}"?`);
  if (!confirmed) return;

  saveCurrentUserData((currentUser) => {
    currentUser.customRecipes = (currentUser.customRecipes || []).filter((item) => item.id !== recipeId);
  });
  resetRecipeForm();
  renderRecipeLibrary();
  showSuccess("recipe-success", "Custom recipe deleted.");
}

function renderRecipeLibrary() {
  const container = document.getElementById("recipe-library");
  if (!container) return;

  const query = document.getElementById("recipe-library-search")?.value.trim().toLowerCase() || "";
  const type = document.getElementById("recipe-library-type")?.value || "all";
  let meals = getAllMealItems();

  if (type !== "all") meals = meals.filter((meal) => meal.type === type);
  if (query) meals = meals.filter((meal) => mealSearchText(meal).includes(query));

  if (meals.length === 0) {
    container.innerHTML = '<p class="empty-state small-empty">No recipes found.</p>';
    return;
  }

  container.innerHTML = meals
    .map((meal) => {
      const ingredients = (meal.ingredients || []).map((item) => item.name).slice(0, 5).join(", ");
      const safeName = escapeHTML(meal.name);
      const encodedMealNameForHandler = encodeRecipeNameForHandler(meal.name);
      const editDeleteActions = meal.isCustom
        ? `<button class="btn btn-outline btn-xs" onclick="editCustomRecipe('${meal.id}')">Edit</button><button class="btn btn-outline btn-xs danger-btn" onclick="deleteCustomRecipe('${meal.id}')">Delete</button>`
        : '<span class="tag-pill">Built-in</span>';
      const reviewButton = getCurrentUser()
        ? `<button class="btn btn-outline btn-xs" onclick="openReviewModalFromEncoded('${encodedMealNameForHandler}')">Review</button>`
        : "";
      return `
        <div class="recipe-card">
          <div class="recipe-card-top">
            <span class="meal-label">${toTitleCase(meal.type)}</span>
            <div class="button-row compact-actions">${editDeleteActions}${reviewButton}</div>
          </div>
          <h3>${safeName}</h3>
          <p class="meal-meta">${formatMoney(meal.cost)} · ${formatCalories(meal.calories)} · ${formatWeightFromGrams(getMealPortionGrams(meal))} per serving</p>
          <p class="meal-meta review-summary">${escapeHTML(getReviewSummary(meal.name))}</p>
          <p class="meal-meta">Ingredients: ${escapeHTML(ingredients || "Not listed")}</p>
        </div>
      `;
    })
    .join("");
}

// ==================== Shopping List Generation ====================

function getShoppingItems(mealTypeFilter = "all") {
  const plan = getCurrentPlan();
  if (!plan) return [];

  const map = new Map();
  DAYS.forEach((day) => {
    MEAL_TYPES.forEach((type) => {
      if (mealTypeFilter !== "all" && type !== mealTypeFilter) return;
      const meal = resolveMeal(plan[day][type]);
      (meal.ingredients || []).forEach((rawItem) => {
        const item = normaliseIngredientWeight(rawItem);
        const key = `${item.name.toLowerCase()}|${item.category || "Other"}`;
        if (!map.has(key)) {
          map.set(key, {
            name: item.name,
            grams: 0,
            baseQty: item.qty,
            originalUnit: item.unit,
            baseGrams: item.baseGrams,
            gramsPerUnit: item.gramsPerUnit,
            category: item.category || "Other",
            sourceUnits: new Set(),
            sources: new Set(),
          });
        }
        const entry = map.get(key);
        entry.grams += item.baseGrams * getServingSize();
        entry.sourceUnits.add(`${formatNumber(item.qty)} ${item.unit} ≈ ${formatNumber(item.baseGrams)} g`);
        entry.sources.add(`${day} ${toTitleCase(type)}: ${meal.name}`);
      });
    });
  });

  return Array.from(map.values()).map((item) => ({
    ...item,
    sourceUnits: Array.from(item.sourceUnits),
    sources: Array.from(item.sources),
  }));
}

function populateShoppingCategoryFilter() {
  const select = document.getElementById("shopping-category");
  if (!select) return;
  const current = select.value || "all";
  const categories = [...new Set(getShoppingItems("all").map((item) => item.category))].sort();
  select.innerHTML = '<option value="all">All Categories</option>' + categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("");
  select.value = categories.includes(current) ? current : "all";
}

function renderShoppingList() {
  const list = document.getElementById("shopping-list");
  const summary = document.getElementById("shopping-summary");
  const plan = getCurrentPlan();

  if (!plan) {
    summary.innerHTML = "";
    list.innerHTML = '<p class="empty-state">Generate a weekly meal plan first, then the shopping list will appear here.</p>';
    return;
  }

  const query = document.getElementById("shopping-search")?.value.trim().toLowerCase() || "";
  const category = document.getElementById("shopping-category")?.value || "all";
  const mealType = document.getElementById("shopping-meal-type")?.value || "all";
  let items = getShoppingItems(mealType);
  populateShoppingCategoryFilter();

  if (category !== "all") items = items.filter((item) => item.category === category);
  if (query) {
    items = items.filter((item) => {
      const sourceText = `${item.sources.join(" ")} ${item.sourceUnits.join(" ")}`.toLowerCase();
      return `${item.name} ${item.category} ${formatShoppingQuantity(item.grams)} ${sourceText}`.toLowerCase().includes(query);
    });
  }

  items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const allItems = getShoppingItems(mealType);
  summary.innerHTML = `
    <div class="summary-strip">
      <div><strong>${items.length}</strong><span>Visible Items</span></div>
      <div><strong>${allItems.length}</strong><span>Total Items</span></div>
      <div><strong>${toTitleCase(mealType)}</strong><span>Meal Filter</span></div>
    </div>
  `;

  if (items.length === 0) {
    list.innerHTML = '<p class="empty-state small-empty">No shopping items match the current filters.</p>';
    return;
  }

  const grouped = items.reduce((acc, item) => {
    acc[item.category] = acc[item.category] || [];
    acc[item.category].push(item);
    return acc;
  }, {});

  list.innerHTML = Object.entries(grouped)
    .map(([group, groupItems]) => `
      <section class="shopping-group">
        <h2>${escapeHTML(group)}</h2>
        ${groupItems
          .map((item) => `
            <div class="shopping-item">
              <label class="shopping-check"><input type="checkbox"><span></span></label>
              <div class="shopping-item-main">
                <strong>${escapeHTML(item.name)}</strong>
                <p>${escapeHTML(formatShoppingQuantity(item.grams))}</p>
                <small>Base per serving: ${escapeHTML(item.sourceUnits.slice(0, 2).join("; "))}${item.sourceUnits.length > 2 ? " ..." : ""}</small>
                <small>Used in: ${escapeHTML(item.sources.slice(0, 3).join("; "))}${item.sources.length > 3 ? " ..." : ""}</small>
              </div>
            </div>
          `)
          .join("")}
      </section>
    `)
    .join("");
}

// ==================== Meal Prep Schedule ====================

const DEFAULT_PREP_TIMES = {
  breakfast: "07:30",
  lunch: "12:00",
  dinner: "17:30",
  snack: "15:30",
  custom: "18:00",
};

function formatTimeLabel(time) {
  if (!time) return "No time set";
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText || 0);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function getIngredientNames(meal) {
  return (meal.ingredients || []).slice(0, 4).map((item) => item.name).filter(Boolean);
}

function buildAutoPrepTask(day, type, meal, existing = {}) {
  const mealChanged = existing.mealId && existing.mealId !== meal.id;
  return {
    id: `auto-${day}-${type}`,
    source: "auto",
    day,
    type,
    mealId: meal.id,
    mealName: meal.name,
    title: `Prepare ${meal.name}`,
    scheduledTime: existing.scheduledTime || DEFAULT_PREP_TIMES[type] || "18:00",
    estimatedMinutes: Number(meal.prepMinutes || 0),
    ingredients: getIngredientNames(meal),
    note: mealChanged ? "" : existing.note || "",
    done: mealChanged ? false : Boolean(existing.done),
  };
}

function syncPrepTasksWithPlan(options = {}) {
  const plan = getCurrentPlan();
  if (!plan) return [];
  const { resetAutoTasks = false } = options;
  let updatedTasks = [];

  saveCurrentUserData((user) => {
    const currentTasks = user.prepTasks || [];
    if (resetAutoTasks) user.hiddenPrepTaskIds = [];
    const hiddenIds = user.hiddenPrepTaskIds || [];
    const customTasks = currentTasks.filter((task) => task.source === "custom");
    const currentAutoTasks = resetAutoTasks ? [] : currentTasks.filter((task) => task.source !== "custom");
    const autoTasks = [];

    DAYS.forEach((day) => {
      MEAL_TYPES.forEach((type) => {
        const meal = resolveMeal(plan[day]?.[type]);
        const id = `auto-${day}-${type}`;
        const existing = currentAutoTasks.find((task) => task.id === id) || {};
        if (!hiddenIds.includes(id)) autoTasks.push(buildAutoPrepTask(day, type, meal, existing));
      });
    });

    user.prepTasks = [...autoTasks, ...customTasks];
    updatedTasks = user.prepTasks;
  });

  return updatedTasks;
}

function getPrepTasksForCurrentPlan() {
  const user = getCurrentUserData();
  if (!user) return [];
  ensureUserShape(user, getCurrentUser() || "Guest");
  if (!getCurrentPlan()) return [];
  if (!user.prepTasks || user.prepTasks.length === 0) return syncPrepTasksWithPlan();
  return syncPrepTasksWithPlan({ resetAutoTasks: false });
}

function renderPrepSummary(tasks, visibleTasks) {
  const summary = document.getElementById("prep-summary");
  if (!summary) return;
  const doneCount = tasks.filter((task) => task.done).length;
  const estimated = tasks.reduce((total, task) => total + Number(task.estimatedMinutes || 0), 0);
  summary.innerHTML = `
    <div class="summary-strip prep-summary-strip">
      <div><strong>${visibleTasks.length}</strong><span>Visible Tasks</span></div>
      <div><strong>${doneCount}/${tasks.length}</strong><span>Completed</span></div>
      <div><strong>${estimated}</strong><span>Estimated Minutes</span></div>
    </div>
  `;
}

function groupPrepTasksByDay(tasks) {
  return DAYS.reduce((acc, day) => {
    acc[day] = tasks.filter((task) => task.day === day).sort((a, b) => (a.scheduledTime || "99:99").localeCompare(b.scheduledTime || "99:99"));
    return acc;
  }, {});
}

function getFilteredPrepTasks(tasks) {
  const filter = document.getElementById("prep-filter")?.value || "all";
  if (filter === "done") return tasks.filter((task) => task.done);
  if (filter === "not-done") return tasks.filter((task) => !task.done);
  if (filter === "custom") return tasks.filter((task) => task.source === "custom");
  if (MEAL_TYPES.includes(filter)) return tasks.filter((task) => task.type === filter);
  return tasks;
}

function renderPrepSchedule() {
  const container = document.getElementById("prep-schedule");
  const plan = getCurrentPlan();

  if (!plan) {
    document.getElementById("prep-summary").innerHTML = "";
    container.innerHTML = '<p class="empty-state">Generate a weekly meal plan first, then the meal prep schedule will appear here.</p>';
    return;
  }

  const tasks = getPrepTasksForCurrentPlan();
  const visibleTasks = getFilteredPrepTasks(tasks);
  renderPrepSummary(tasks, visibleTasks);

  if (visibleTasks.length === 0) {
    container.innerHTML = '<p class="empty-state small-empty">No prep tasks match the current filter.</p>';
    return;
  }

  const grouped = groupPrepTasksByDay(visibleTasks);
  container.innerHTML = DAYS
    .filter((day) => grouped[day].length > 0)
    .map((day) => `
      <div class="day-card prep-card">
        <div class="day-card-header">${day}</div>
        <div class="day-card-body">
          ${grouped[day]
            .map((task) => renderPrepTask(task))
            .join("")}
        </div>
      </div>
    `)
    .join("");
}

function renderPrepTask(task) {
  const ingredients = task.ingredients?.length ? task.ingredients.join(", ") : "not listed";
  const note = task.note ? `<p class="meal-meta prep-note">Note: ${escapeHTML(task.note)}</p>` : "";
  const estimated = task.estimatedMinutes ? `<span class="prep-time">${task.estimatedMinutes} min</span>` : `<span class="prep-time muted-pill">Custom</span>`;
  return `
    <div class="prep-task ${task.done ? "task-done" : ""}">
      <label class="prep-check">
        <input type="checkbox" ${task.done ? "checked" : ""} onchange="togglePrepTaskDone('${task.id}')">
        <span></span>
      </label>
      <div class="prep-task-main">
        <div class="prep-task-topline">
          <span class="prep-clock">${formatTimeLabel(task.scheduledTime)}</span>
          <span class="meal-label">${toTitleCase(task.type)}</span>
          ${estimated}
        </div>
        <strong>${escapeHTML(task.title || task.mealName)}</strong>
        <p class="meal-meta">Ingredients: ${escapeHTML(ingredients)}</p>
        ${note}
      </div>
      <div class="prep-actions">
        <button class="btn btn-outline btn-xs" onclick="openPrepTaskModal('${task.id}')">Edit</button>
      </div>
    </div>
  `;
}

function updatePrepTask(taskId, updateFn) {
  saveCurrentUserData((user) => {
    user.prepTasks = user.prepTasks || [];
    const index = user.prepTasks.findIndex((task) => task.id === taskId);
    if (index >= 0) updateFn(user.prepTasks[index], index, user.prepTasks);
  });
}

function togglePrepTaskDone(taskId) {
  updatePrepTask(taskId, (task) => {
    task.done = !task.done;
  });
  renderPrepSchedule();
}

function resetPrepTasksFromPlan() {
  if (!getCurrentPlan()) {
    showError("prep-alert", "Generate a weekly meal plan first.");
    return;
  }
  syncPrepTasksWithPlan({ resetAutoTasks: true });
  renderPrepSchedule();
  showSuccess("prep-alert", "Meal prep tasks refreshed from the current weekly meal plan.");
}

function openPrepTaskModal(taskId = "") {
  const tasks = getPrepTasksForCurrentPlan();
  const task = taskId ? tasks.find((item) => item.id === taskId) : null;
  document.getElementById("prep-task-id").value = task?.id || "";
  document.getElementById("prep-modal-title").textContent = task ? "Edit Prep Task" : "Add Prep Task";
  document.getElementById("prep-task-title").value = task?.title || "";
  document.getElementById("prep-task-time").value = task?.scheduledTime || DEFAULT_PREP_TIMES.custom;
  document.getElementById("prep-task-day").value = task?.day || "Monday";
  document.getElementById("prep-task-type").value = task?.type || "custom";
  document.getElementById("prep-task-note").value = task?.note || "";
  document.getElementById("prep-task-delete").style.display = task ? "inline-block" : "none";
  document.getElementById("prep-task-modal").classList.add("active");
  document.getElementById("prep-task-modal").setAttribute("aria-hidden", "false");
}

function closePrepTaskModal() {
  document.getElementById("prep-task-modal").classList.remove("active");
  document.getElementById("prep-task-modal").setAttribute("aria-hidden", "true");
}

function savePrepTask() {
  const taskId = document.getElementById("prep-task-id").value;
  const title = document.getElementById("prep-task-title").value.trim();
  const scheduledTime = document.getElementById("prep-task-time").value;
  const day = document.getElementById("prep-task-day").value;
  const type = document.getElementById("prep-task-type").value;
  const note = document.getElementById("prep-task-note").value.trim();

  if (!title || !scheduledTime || !day || !type) {
    showError("prep-alert", "Please enter a task name, day, type, and scheduled time.");
    return;
  }

  saveCurrentUserData((user) => {
    user.prepTasks = user.prepTasks || [];
    if (taskId) {
      const index = user.prepTasks.findIndex((task) => task.id === taskId);
      if (index >= 0) {
        user.prepTasks[index] = {
          ...user.prepTasks[index],
          title,
          scheduledTime,
          day,
          type,
          note,
        };
      }
    } else {
      user.prepTasks.push({
        id: `custom-${Date.now()}`,
        source: "custom",
        day,
        type,
        title,
        scheduledTime,
        note,
        mealName: title,
        ingredients: [],
        estimatedMinutes: 0,
        done: false,
      });
    }
  });

  closePrepTaskModal();
  renderPrepSchedule();
  showSuccess("prep-alert", taskId ? "Prep task updated." : "Custom prep task added.");
}

function deletePrepTaskFromModal() {
  const taskId = document.getElementById("prep-task-id").value;
  if (!taskId) return;
  saveCurrentUserData((user) => {
    const task = (user.prepTasks || []).find((item) => item.id === taskId);
    if (task?.source === "auto") {
      user.hiddenPrepTaskIds = Array.from(new Set([...(user.hiddenPrepTaskIds || []), taskId]));
    }
    user.prepTasks = (user.prepTasks || []).filter((item) => item.id !== taskId);
  });
  closePrepTaskModal();
  renderPrepSchedule();
  showSuccess("prep-alert", "Prep task deleted. Use Refresh From Meal Plan to bring auto tasks back.");
}

function ensureDefaultAccounts() {
  const users = getUsers();
  let changed = false;

  if (!users[DEFAULT_ADMIN_USERNAME]) {
    users[DEFAULT_ADMIN_USERNAME] = {
      role: "admin",
      passwordHash: DEFAULT_ADMIN_PASSWORD_HASH,
      profile: {
        displayName: "Admin",
        age: "",
        calorieTarget: "",
        weeklyBudget: "",
      },
      preferences: {
        dietary: [],
        allergies: [],
      },
      settings: {
        measurementUnit: "metric",
        servingSize: 1,
      },
      mealPlans: {},
      customRecipes: [],
      prepTasks: [],
      hiddenPrepTaskIds: [],
      createdAt: new Date().toISOString(),
    };
    changed = true;
  } else {
    ensureUserShape(users[DEFAULT_ADMIN_USERNAME], DEFAULT_ADMIN_USERNAME);
    if (users[DEFAULT_ADMIN_USERNAME].role !== "admin") {
      users[DEFAULT_ADMIN_USERNAME].role = "admin";
      changed = true;
    }
  }

  if (changed) saveUsers(users);
}

// ==================== Auto-login on page load ====================

(async function init() {
  await loadDatabaseState();
  ensureDefaultAccounts();
  if (loadSharedPlan()) return;

  const savedUser = getCurrentUser();
  if (savedUser) {
    const users = getUsers();
    if (users[savedUser]) {
      ensureUserShape(users[savedUser], savedUser);
      saveUsers(users);
      enterDashboard(savedUser);
      return;
    }
    sessionStorage.removeItem("mealapp_session");
  }
  setSharedPlanMode(false);
  showView("login");
})();
