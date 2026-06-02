const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'database.db');
const SCHEMA_PATH = path.join(ROOT, 'schema.sql');
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function insertUser(username, user) {
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, role, created_at)
    VALUES (?, ?, ?, ?)
  `).run(
    username,
    user.passwordHash || '',
    user.role || 'user',
    user.createdAt || new Date().toISOString()
  );

  const userId = Number(result.lastInsertRowid);
  const profile = user.profile || {};
  const settings = user.settings || {};
  const preferences = user.preferences || { dietary: [], allergies: [] };
  const extraState = {
    mealPlans: {
      history: Array.isArray(user.mealPlans?.history) ? user.mealPlans.history : [],
      lockedSlots: Array.isArray(user.mealPlans?.lockedSlots) ? user.mealPlans.lockedSlots : [],
    },
    prepTasks: Array.isArray(user.prepTasks) ? user.prepTasks : [],
    hiddenPrepTaskIds: Array.isArray(user.hiddenPrepTaskIds) ? user.hiddenPrepTaskIds : [],
    excludedRecipeIds: Array.isArray(user.excludedRecipeIds) ? user.excludedRecipeIds : [],
    leftoverIngredients: Array.isArray(user.leftoverIngredients) ? user.leftoverIngredients : [],
  };

  db.prepare(`
    INSERT INTO user_profiles (user_id, display_name, age, calorie_target, weekly_budget)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    userId,
    profile.displayName || username,
    profile.age || '',
    profile.calorieTarget || '',
    profile.weeklyBudget || ''
  );

  db.prepare(`
    INSERT INTO user_settings (user_id, measurement_unit, serving_size)
    VALUES (?, ?, ?)
  `).run(
    userId,
    settings.measurementUnit || 'metric',
    Number(settings.servingSize || 1)
  );

  db.prepare(`
    INSERT OR REPLACE INTO user_extra_state (username, data_json)
    VALUES (?, ?)
  `).run(username, JSON.stringify(extraState));

  const insertDiet = db.prepare('INSERT OR IGNORE INTO user_dietary_preferences (user_id, preference) VALUES (?, ?)');
  (preferences.dietary || []).forEach((preference) => insertDiet.run(userId, String(preference)));

  const insertAllergy = db.prepare('INSERT OR IGNORE INTO user_allergies (user_id, allergy) VALUES (?, ?)');
  (preferences.allergies || []).forEach((allergy) => insertAllergy.run(userId, String(allergy)));

  const insertRecipe = db.prepare('INSERT OR REPLACE INTO custom_recipes (id, user_id, data_json) VALUES (?, ?, ?)');
  (user.customRecipes || []).forEach((recipe) => {
    if (recipe?.id) insertRecipe.run(String(recipe.id), userId, JSON.stringify(recipe));
  });

  const insertFavourite = db.prepare('INSERT OR IGNORE INTO user_favourite_recipes (user_id, recipe_id) VALUES (?, ?)');
  (user.favouriteRecipeIds || []).forEach((recipeId) => {
    if (recipeId) insertFavourite.run(userId, String(recipeId));
  });

  const currentPlan = user.mealPlans?.current;
  if (currentPlan && typeof currentPlan === 'object') {
    const planResult = db.prepare(`
      INSERT INTO meal_plans (user_id, generated_at, is_current)
      VALUES (?, ?, 1)
    `).run(userId, user.mealPlans?.generatedAt || new Date().toISOString());
    const planId = Number(planResult.lastInsertRowid);
    const insertMealItem = db.prepare(`
      INSERT INTO meal_plan_items
      (meal_plan_id, day, meal_type, recipe_id, recipe_name, completed, serving_size)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    Object.entries(currentPlan).forEach(([day, meals]) => {
      Object.entries(meals || {}).forEach(([mealType, mealRef]) => {
        const ref = typeof mealRef === 'string'
          ? { id: mealRef, name: mealRef, type: mealType, completed: false }
          : (mealRef || {});
        insertMealItem.run(
          planId,
          day,
          mealType,
          ref.id || ref.name || '',
          ref.name || ref.id || '',
          ref.completed ? 1 : 0,
          Number(ref.servingSize || settings.servingSize || 1)
        );
      });
    });
  }
}

function saveStateToDatabase(state) {
  const users = state.users || {};
  const reviews = state.reviews || {};

  db.exec('BEGIN;');
  try {
    db.exec('PRAGMA foreign_keys = OFF;');
    [
      'reviews',
      'user_favourite_recipes',
      'user_extra_state',
      'meal_plan_items',
      'meal_plans',
      'custom_recipes',
      'user_allergies',
      'user_dietary_preferences',
      'user_settings',
      'user_profiles',
      'users',
    ].forEach((table) => db.exec(`DELETE FROM ${table};`));
    db.exec('PRAGMA foreign_keys = ON;');

    Object.entries(users).forEach(([username, user]) => insertUser(username, user || {}));

    const insertReview = db.prepare(`
      INSERT OR REPLACE INTO reviews
      (id, recipe_key, recipe_name, username, rating, comment, date, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    Object.entries(reviews).forEach(([recipeKey, list]) => {
      (list || []).forEach((review, index) => {
        const reviewId = review.id || `${recipeKey}-${index}-${Date.now()}`;
        insertReview.run(
          reviewId,
          recipeKey,
          review.recipeName || '',
          review.user || '',
          Number(review.rating || 0),
          review.comment || '',
          review.date || new Date().toISOString(),
          review.updatedAt || ''
        );
      });
    });

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function exportStateFromDatabase() {
  const users = {};
  const userRows = db.prepare('SELECT * FROM users ORDER BY id').all();

  for (const row of userRows) {
    const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(row.id) || {};
    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(row.id) || {};
    const dietary = db.prepare('SELECT preference FROM user_dietary_preferences WHERE user_id = ? ORDER BY preference').all(row.id).map((item) => item.preference);
    const allergies = db.prepare('SELECT allergy FROM user_allergies WHERE user_id = ? ORDER BY allergy').all(row.id).map((item) => item.allergy);
    const customRecipes = db.prepare('SELECT data_json FROM custom_recipes WHERE user_id = ? ORDER BY id').all(row.id).map((item) => {
      try { return JSON.parse(item.data_json); } catch { return null; }
    }).filter(Boolean);
    const extraRow = db.prepare('SELECT data_json FROM user_extra_state WHERE username = ?').get(row.username);
    let extraState = {};
    if (extraRow?.data_json) {
      try { extraState = JSON.parse(extraRow.data_json) || {}; } catch { extraState = {}; }
    }
    const favouriteRecipeIds = db.prepare('SELECT recipe_id FROM user_favourite_recipes WHERE user_id = ? ORDER BY created_at, id').all(row.id).map((item) => item.recipe_id);

    const user = {
      role: row.role || 'user',
      passwordHash: row.password_hash || '',
      profile: {
        displayName: profile.display_name || row.username,
        age: profile.age || '',
        calorieTarget: profile.calorie_target || '',
        weeklyBudget: profile.weekly_budget || '',
      },
      preferences: { dietary, allergies },
      settings: {
        measurementUnit: settings.measurement_unit || 'metric',
        servingSize: Number(settings.serving_size || 1),
      },
      mealPlans: {
        history: Array.isArray(extraState.mealPlans?.history) ? extraState.mealPlans.history : [],
        lockedSlots: Array.isArray(extraState.mealPlans?.lockedSlots) ? extraState.mealPlans.lockedSlots : [],
      },
      customRecipes,
      favouriteRecipeIds,
      prepTasks: Array.isArray(extraState.prepTasks) ? extraState.prepTasks : [],
      hiddenPrepTaskIds: Array.isArray(extraState.hiddenPrepTaskIds) ? extraState.hiddenPrepTaskIds : [],
      excludedRecipeIds: Array.isArray(extraState.excludedRecipeIds) ? extraState.excludedRecipeIds : [],
      leftoverIngredients: Array.isArray(extraState.leftoverIngredients) ? extraState.leftoverIngredients : [],
      createdAt: row.created_at || new Date().toISOString(),
    };

    const currentPlan = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND is_current = 1 ORDER BY id DESC LIMIT 1').get(row.id);
    if (currentPlan) {
      user.mealPlans.generatedAt = currentPlan.generated_at;
      user.mealPlans.current = {};
      const items = db.prepare('SELECT * FROM meal_plan_items WHERE meal_plan_id = ? ORDER BY id').all(currentPlan.id);
      for (const item of items) {
        if (!user.mealPlans.current[item.day]) user.mealPlans.current[item.day] = {};
        user.mealPlans.current[item.day][item.meal_type] = {
          id: item.recipe_id || item.recipe_name,
          name: item.recipe_name || item.recipe_id,
          type: item.meal_type,
          completed: Boolean(item.completed),
          servingSize: Number(item.serving_size || user.settings.servingSize || 1),
        };
      }
    }

    users[row.username] = user;
  }

  const reviews = {};
  const reviewRows = db.prepare('SELECT * FROM reviews ORDER BY date').all();
  for (const review of reviewRows) {
    reviews[review.recipe_key] = reviews[review.recipe_key] || [];
    reviews[review.recipe_key].push({
      id: review.id,
      recipeName: review.recipe_name,
      user: review.username,
      rating: Number(review.rating || 0),
      comment: review.comment || '',
      date: review.date || '',
      updatedAt: review.updated_at || '',
    });
  }

  return { users, reviews };
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/health' && req.method === 'GET') {
    return jsonResponse(res, 200, { ok: true, database: path.basename(DB_PATH) });
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    return jsonResponse(res, 200, exportStateFromDatabase());
  }

  if (pathname === '/api/state' && req.method === 'POST') {
    try {
      const state = await readRequestJson(req);
      saveStateToDatabase(state);
      return jsonResponse(res, 200, { ok: true, savedAt: new Date().toISOString() });
    } catch (error) {
      return jsonResponse(res, 400, { ok: false, error: error.message || 'Invalid state payload' });
    }
  }

  return jsonResponse(res, 404, { ok: false, error: 'API route not found' });
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, safePath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

if (process.argv.includes('--init-db')) {
  console.log(`SQLite database ready: ${DB_PATH}`);
  db.close();
  process.exit(0);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch((error) => {
      jsonResponse(res, 500, { ok: false, error: error.message || 'Server error' });
    });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log('Weekly Meal Planner SQLite V1.2 running.');
  console.log(`Open: http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
