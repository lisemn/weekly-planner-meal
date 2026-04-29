// ==================== Utility ====================

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
}

function getCurrentUser() {
  return sessionStorage.getItem("mealapp_session");
}

// ==================== View Management ====================

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(name + "-view").classList.add("active");
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
  el.textContent = message;
  el.classList.add("show");
}

function showSuccess(id, message) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.classList.add("show");
}

// ==================== Registration ====================

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
    passwordHash: await hashPassword(password),
    mealPlans: {},
    createdAt: new Date().toISOString(),
  };

  saveUsers(users);

  document.getElementById("register-form").reset();
  showSuccess("register-success", "Account created! You can now log in.");

  setTimeout(() => showView("login"), 1500);
}

// ==================== Login ====================

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

  sessionStorage.setItem("mealapp_session", username);
  document.getElementById("login-form").reset();
  enterDashboard(username);
}

// ==================== Logout ====================

function handleLogout() {
  sessionStorage.removeItem("mealapp_session");
  showView("login");
}

// ==================== Dashboard ====================

function enterDashboard(username) {
  document.getElementById("dash-user").textContent = username;
  showView("dashboard");
  loadSavedPlan(username);
}

function loadSavedPlan(username) {
  const users = getUsers();
  const plan = users[username]?.mealPlans?.current;

  if (plan) {
    renderMealPlan(plan);
  } else {
    document.getElementById("meal-plan-grid").innerHTML =
      '<p class="empty-state">Click "Generate New Plan" to create your weekly meal plan.</p>';
  }
}

// ==================== Meal Plan Generation ====================

const MEALS = {
  breakfast: [
    "Oatmeal with berries and honey",
    "Scrambled eggs with toast",
    "Greek yogurt parfait with granola",
    "Banana pancakes",
    "Avocado toast with poached egg",
    "Smoothie bowl with mixed fruits",
    "French toast with maple syrup",
    "Breakfast burrito with salsa",
    "Chia seed pudding with mango",
    "Whole grain cereal with milk",
    "Veggie omelette with cheese",
    "Bagel with cream cheese and smoked salmon",
    "Açaí bowl with coconut flakes",
    "English muffin with peanut butter",
  ],
  lunch: [
    "Grilled chicken Caesar salad",
    "Turkey and avocado wrap",
    "Vegetable stir-fry with rice",
    "Tomato basil soup with grilled cheese",
    "Quinoa bowl with roasted vegetables",
    "Tuna salad sandwich on whole wheat",
    "Mediterranean hummus plate with pita",
    "Black bean tacos with lime crema",
    "Chicken noodle soup",
    "Caprese panini with balsamic glaze",
    "Poke bowl with salmon and edamame",
    "Lentil curry with naan bread",
    "Greek salad with feta and olives",
    "BBQ chicken quesadilla",
  ],
  dinner: [
    "Baked salmon with roasted asparagus",
    "Spaghetti bolognese with garlic bread",
    "Grilled chicken with mashed potatoes",
    "Beef stir-fry with broccoli and rice",
    "Vegetable lasagna",
    "Shrimp tacos with mango salsa",
    "Roast chicken with roasted vegetables",
    "Penne arrabbiata with side salad",
    "Teriyaki salmon with steamed rice",
    "Stuffed bell peppers with ground turkey",
    "Chicken tikka masala with basmati rice",
    "Pan-seared cod with lemon butter sauce",
    "Mushroom risotto with parmesan",
    "Grilled steak with sweet potato fries",
  ],
  snack: [
    "Apple slices with almond butter",
    "Trail mix with dark chocolate",
    "Carrot sticks with hummus",
    "Mixed nuts and dried fruit",
    "String cheese with whole grain crackers",
    "Celery with peanut butter",
    "Frozen grapes",
    "Rice cakes with avocado",
    "Hard-boiled eggs",
    "Popcorn with light seasoning",
    "Banana with Nutella",
    "Edamame with sea salt",
    "Cottage cheese with pineapple",
    "Yogurt with honey",
  ],
};

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateMealPlan() {
  const plan = {};

  const breakfasts = pickRandom(MEALS.breakfast, 7);
  const lunches = pickRandom(MEALS.lunch, 7);
  const dinners = pickRandom(MEALS.dinner, 7);
  const snacks = pickRandom(MEALS.snack, 7);

  DAYS.forEach((day, i) => {
    plan[day] = {
      breakfast: breakfasts[i],
      lunch: lunches[i],
      dinner: dinners[i],
      snack: snacks[i],
    };
  });

  const username = getCurrentUser();
  if (username) {
    const users = getUsers();
    if (users[username]) {
      users[username].mealPlans = users[username].mealPlans || {};
      users[username].mealPlans.current = plan;
      users[username].mealPlans.generatedAt = new Date().toISOString();
      saveUsers(users);
    }
  }

  renderMealPlan(plan);
}

function renderMealPlan(plan) {
  const grid = document.getElementById("meal-plan-grid");
  grid.innerHTML = "";

  DAYS.forEach((day) => {
    const meals = plan[day];
    const card = document.createElement("div");
    card.className = "day-card";

    card.innerHTML = `
      <div class="day-card-header">${day}</div>
      <div class="day-card-body">
        <div class="meal-row">
          <span class="meal-label">Breakfast</span>
          <span class="meal-name">${meals.breakfast}</span>
        </div>
        <div class="meal-row">
          <span class="meal-label">Lunch</span>
          <span class="meal-name">${meals.lunch}</span>
        </div>
        <div class="meal-row">
          <span class="meal-label">Dinner</span>
          <span class="meal-name">${meals.dinner}</span>
        </div>
        <div class="meal-row">
          <span class="meal-label">Snack</span>
          <span class="meal-name">${meals.snack}</span>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// ==================== Auto-login on page load ====================

(function init() {
  const savedUser = getCurrentUser();
  if (savedUser) {
    const users = getUsers();
    if (users[savedUser]) {
      enterDashboard(savedUser);
      return;
    }
    sessionStorage.removeItem("mealapp_session");
  }
  showView("login");
})();
