PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY,
  display_name TEXT,
  age TEXT,
  calorie_target TEXT,
  weekly_budget TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY,
  measurement_unit TEXT DEFAULT 'metric',
  serving_size REAL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_dietary_preferences (
  user_id INTEGER NOT NULL,
  preference TEXT NOT NULL,
  PRIMARY KEY (user_id, preference),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_allergies (
  user_id INTEGER NOT NULL,
  allergy TEXT NOT NULL,
  PRIMARY KEY (user_id, allergy),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_recipes (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS user_favourite_recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  recipe_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, recipe_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_current INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_plan_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  recipe_id TEXT,
  recipe_name TEXT,
  completed INTEGER DEFAULT 0,
  serving_size REAL DEFAULT 1,
  FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  recipe_key TEXT NOT NULL,
  recipe_name TEXT,
  username TEXT,
  rating INTEGER,
  comment TEXT,
  date TEXT,
  updated_at TEXT
);


CREATE TABLE IF NOT EXISTS user_extra_state (
  username TEXT PRIMARY KEY,
  data_json TEXT NOT NULL
);
