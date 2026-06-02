Weekly Meal Planner SQLite Database
=========================================

What's in
---------
- index.html: main page structure for login, dashboard, recipes, favourites, shopping list, meal prep, profile, and preferences.
- style.css: visual layout, colours, cards, buttons, navigation, modals, favourite recipe styling, and responsive design.
- app.js: front-end logic for meal plans, recipes, favourite recipes, serving size, measurement units, meal completion, shopping list, reviews, plan history, meal lock, and SQLite data sync.
- server.js: local Node.js server that runs the website and connects the front end to SQLite.
- schema.sql: database table setup used to create the SQLite structure, including user_favourite_recipes.
- database.db: SQLite database file where saved app data is stored.
- planHistory.js / planHistory.css: weekly plan history feature.
- mealLock.js / mealLock.css: lock meals before regenerating plan feature.
- package.json: project start settings for npm.

How to run
----------
1. Install Node.js LTS.
   - Node.js v24.16.0 LTS has been tested.

2. Unzip the project folder.

3. Open the project folder that contains package.json and server.js.

4. Open CMD in that folder.
   - Easy way: click the folder address bar, type cmd, then press Enter.

5. Start the app:
   npm start

   If PowerShell blocks npm scripts, use:
   npm.cmd start

6. Open the app in your browser:
   http://localhost:3000

How to stop
-----------
- In the CMD/PowerShell window, press:
  Ctrl + C

- If Windows asks to terminate the batch job, type:
  Y

Important
---------
- Do not run this SQLite version by double-clicking index.html.
- SQLite needs server.js, so this version must run through localhost.
- The app can run offline after Node.js is installed.
- Localhost does not mean online hosting. It only runs on your own computer.
- database.db stores the local saved data.
- Local data and online/server data are separate unless you manually copy or sync the database.
- Favourite Recipes are saved in SQLite through the user_favourite_recipes table, not as a separate browser-only localStorage list.
- No extra npm packages are required in this version because it uses Node's built-in SQLite support.

Useful check
------------
Check Node.js:
node -v

Check npm:
npm -v

Check the server/database API:
http://localhost:3000/api/health

If port 3000 is already used
----------------------------
Use another port:
set PORT=3001
npm start

Then open:
http://localhost:3001
