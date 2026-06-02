// ==================== Auto Shopping List Feature ====================
// Uses the main app's renderShoppingList() (filters, units, serving size).

function refreshAutoShoppingList() {
  populateShoppingCategoryFilter();
  renderShoppingList();

  const alert =
    document.getElementById("shopping-alert") ||
    document.getElementById("auto-shopping-alert");

  if (alert) {
    alert.textContent = "Shopping list refreshed from the current meal plan.";
    alert.classList.add("show");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const shoppingView = document.getElementById("shopping-view");
  if (!shoppingView) return;

  const filterBar = shoppingView.querySelector(".filter-bar");
  if (filterBar && !document.getElementById("refresh-shopping-btn")) {
    const button = document.createElement("button");
    button.id = "refresh-shopping-btn";
    button.type = "button";
    button.className = "btn btn-outline filter-button";
    button.textContent = "Refresh From Plan";
    button.onclick = refreshAutoShoppingList;
    filterBar.appendChild(button);
  }
});

const originalOpenShoppingList = window.openShoppingList;

window.openShoppingList = function () {
  if (typeof originalOpenShoppingList === "function") {
    originalOpenShoppingList();
  } else {
    refreshAutoShoppingList();
  }
};
