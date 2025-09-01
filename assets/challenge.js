// Challenge Page JavaScript
let challengeData = null;
let currentPage = 1;
const limit = 5;
let equityChartInstance = null;

document.addEventListener("DOMContentLoaded", function () {
  initializeChallenge();
  initializeModal();

  getProgressData();
  getChallengeMeta();
  getChallengeStats();
  getChallengeStatsV2();
  loadTrades(currentPage);
  loadTopTrades();
  getEquityCurve();
  getMostTradedSymbols()
  getConfidenceLevel()
});

function reloadUi() {
  getProgressData();
  getChallengeMeta();
  getChallengeStats();
  getChallengeStatsV2();
  loadTrades(currentPage);
  loadTopTrades();
  getEquityCurve();
  getMostTradedSymbols()
  getConfidenceLevel()
}

// Initialize challenge functionality
function initializeChallenge() {
  // Set up event listeners
  const setChallengeBtn = document.getElementById("setChallengeBtn");
  if (setChallengeBtn) {
    setChallengeBtn.addEventListener("click", openChallengeModal);
  }
}

// Modal functionality
function initializeModal() {
  const modal = document.getElementById("challenge-modal");
  const openModalBtn = document.getElementById("setChallengeBtn");
  const closeModalBtn = document.getElementById("close-modal");
  const cancelBtn = document.getElementById("cancel-challenge");
  const timeframeSelect = document.getElementById("timeframe");
  const customDaysContainer = document.getElementById("custom-days-container");
  const challengeForm = document.getElementById("challenge-form");

  // Open modal
  if (openModalBtn) {
    openModalBtn.addEventListener("click", () => {
      modal.classList.remove("opacity-0", "invisible");
      modal.classList.add("opacity-100", "visible");
    });
  }

  // Close modal
  function closeModal() {
    modal.classList.add("opacity-0", "invisible");
    modal.classList.remove("opacity-100", "visible");
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", closeModal);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeModal);
  }

  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Handle timeframe selection
  if (timeframeSelect) {
    timeframeSelect.addEventListener("change", (e) => {
      if (e.target.value === "custom") {
        customDaysContainer.classList.remove("hidden");
      } else {
        customDaysContainer.classList.add("hidden");
      }
    });
  }

  // Handle form submission
  if (challengeForm) {
    challengeForm.addEventListener("submit", handleChallengeSubmission);
  }
}

// Handle challenge form submission
function handleChallengeSubmission(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const challengeData = {
    startAmount:
      formData.get("start-amount") ||
      document.getElementById("start-amount").value,
    targetAmount:
      formData.get("target-amount") ||
      document.getElementById("target-amount").value,
    timeframe:
      formData.get("timeframe") || document.getElementById("timeframe").value,
    customDays:
      formData.get("custom-days") ||
      document.getElementById("custom-days").value,
    riskPerTrade:
      formData.get("risk-per-trade") ||
      document.getElementById("risk-per-trade").value,
  };

  // Validate the data
  if (!challengeData.startAmount || !challengeData.targetAmount) {
    showNotification("Please fill in all required fields", "error");
    return;
  }

  if (
    parseFloat(challengeData.targetAmount) <=
    parseFloat(challengeData.startAmount)
  ) {
    showNotification(
      "Target amount must be greater than starting amount",
      "error"
    );
    return;
  }

  // Save challenge data (you can implement API call here)
  saveChallengeData(challengeData);

  // Close modal
  document
    .getElementById("challenge-modal")
    .classList.add("opacity-0", "invisible");
  document
    .getElementById("challenge-modal")
    .classList.remove("opacity-100", "visible");

}

// Save challenge data (implement API call)
function saveChallengeData(data) {
  $.ajax({
    url: "saveChallengeData", // Make sure this route matches your CI4 route
    method: "POST",
    data: data,
    dataType: "json",
    headers: {
      "X-Requested-With": "XMLHttpRequest", // Ensures it's detected as AJAX
    },
    success: function (response) {
      if (response.success) {
        createToast(
          "success",
          "Response",
          response.message || "Challenge has been saved."
        );
        reloadUi()
      } else {
        createToast(
          "error",
          "Response",
          response.message || "Failed to save challenge"
        );
      }
    },
    error: function (xhr) {
      // console.error(xhr.responseText);
      createToast(
        "error",
        "Response",
        "An error occurred while saving the challenge"
      );
    },
  });
}


// Open challenge modal function (for external use)
function openChallengeModal() {
  const modal = document.getElementById("challenge-modal");
  if (modal) {
    modal.classList.remove("opacity-0", "invisible");
    modal.classList.add("opacity-100", "visible");
  }
}

// parishram

function getProgressData() {
  $.post(base_url + "getProgressData", {}, function (response) {
    if (response.success) {
      const percent = response.progressPercent;
      const circle = document.getElementById("progressCircle");
      const radius = circle.r.baseVal.value;
      const circumference = 2 * Math.PI * radius;

      circle.style.strokeDasharray = `${circumference}`;
      circle.style.strokeDashoffset = `${circumference}`;

      const offset = circumference - (percent / 100) * circumference;
      circle.style.strokeDashoffset = offset;

      $("#progressText").text(`${percent}%`);
    } else {
      $("#progressText").text("N/A");
      // console.error(response.message);
    }
  });
}

function getChallengeMeta() {
  $.post(base_url + "getChallengeMeta", {}, function (response) {
    if (response.success) {
      $("#daysRemaining").text(response.daysRemaining);
      $("#projectedDate").text(response.projectedDate);
    } else {
      // console.error(response.message);
    }
  });
}

function getChallengeStats() {
  $.post(base_url + "getChallengeStats", {}, function (res) {
    if (res.success) {
      const c = res.currency;

      $("#startingCapital").text(c + res.startAmount.toLocaleString());
      $("#currentCapital").text(c + res.currentAmount.toLocaleString());
      $("#targetCapital").text(c + res.targetAmount.toLocaleString());

      $("#capitalProgress").css("width", res.capitalProgressPercent + "%");

      $("#dailyTarget").text(c + res.dailyTarget.toLocaleString() + "/day");
      $("#todayPnl").text(
        (res.todayPnl >= 0 ? "+" : "") +
        c +
        res.todayPnl.toLocaleString() +
        " today"
      );

      const dailyProgressPercent = (res.todayPnl / res.dailyTarget) * 100;
      $("#dailyProgress").css(
        "width",
        Math.min(Math.max(dailyProgressPercent, 0), 100) + "%"
      );

      $("#winRate").text(res.winRate + "%");
      $("#winRateProgress").css("width", res.winRate + "%");

      $("#scheduleStatus").text("Tracking challenge...");
    } else {
      // console.warn(res.message);
    }
  });
}

function getChallengeStatsV2() {
  $.post(base_url + "getChallengeStatsV2", {}, function (res) {
    if (res.success) {
      $("#progressToTarget").text(res.progressPercent + "%");
      $("#progressBar").css("width", res.progressPercent + "%");

      $("#avgRiskReward").text(res.avgRR !== null ? res.avgRR + " R" : "N/A");

      if (res.highestProfitDate) {
        $("#highestProfitDay").text("₹" + res.highestProfit.toLocaleString());
        $("#highestProfitDate").text(res.highestProfitDate);
      } else {
        $("#highestProfitDay").text("₹0");
        $("#highestProfitDate").text("No trades yet");
      }

      $("#maxDrawdown").text(res.maxDrawdown + "%");
    } else {
      // console.warn(res.message);
    }
  });
}

function getConfidenceLevel() {
  $.post(base_url + "getConfidenceLevel", {}, function (res) {
    let percentage = 0;
    let label = "No trades logged.";

    if (res.success && typeof res.percentage === "number") {
      // Clamp between 0 and 100
      percentage = Math.min(Math.max(res.percentage, 0), 100);
      label = res.label || "Unknown";
    }

    $(".confidence-dot").css("left", percentage + "%");
    $("#confidenceLabel").text(label);
  }).fail(function () {
    $(".confidence-dot").css("left", "0%");
    $("#confidenceLabel").text("Error loading");
  });
}


function loadTrades(page = 1) {
  $.post(
    base_url + "getChallengeTradesPaginated",
    { page, limit },
    function (res) {
      const tbody = $("#tradesTableBody");
      const paginationDiv = $(".pagination-controls");
      const paginationInfo = $(".pagination-info");

      tbody.empty();
      paginationDiv.empty();
      paginationInfo.empty();

      if (!res.success || !res.trades || res.trades.length === 0) {
        tbody.append(
          '<tr><td colspan="9" class="text-center text-gray-500 dark:text-gray-400 py-4">No trades found</td></tr>'
        );
        return;
      }

      res.trades.forEach((trade) => {
        const date = new Date(trade.datetime).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        });

        const tradeType = trade.trade_type == 1 ? "Buy" : "Sell";
        const pnlClass =
          parseFloat(trade.pnl_amount) >= 0
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400";
        const rrRatio =
          trade.rr_ratio !== null
            ? parseFloat(trade.rr_ratio).toFixed(2)
            : "-";

        tbody.append(`
          <tr>
            <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">${date}</td>
            <td class="px-6 py-4 text-sm">${trade.symbol}</td>
            <td class="px-6 py-4 text-sm">${tradeType}</td>
            <td class="px-6 py-4 text-sm">₹${parseFloat(trade.entry_price).toFixed(2)}</td>
            <td class="px-6 py-4 text-sm">₹${parseFloat(trade.exit_price).toFixed(2)}</td>
            <td class="px-6 py-4 text-sm">${trade.entry_quantity}</td>
            <td class="px-6 py-4 text-sm font-medium ${pnlClass}">₹${parseFloat(trade.pnl_amount).toFixed(2)}</td>
            <td class="px-6 py-4 text-sm">${rrRatio}</td>
            <td class="px-6 py-4 text-sm">${trade.lesson || "-"}</td>
          </tr>
        `);
      });

      // Pagination Controls
      const totalPages = Math.ceil(res.total / limit);
      if (totalPages > 1) {
        if (page > 1) {
          paginationDiv.append(
            `<button class="page-btn" data-page="${page - 1}">Previous</button>`
          );
        }

        for (let i = 1; i <= totalPages; i++) {
          paginationDiv.append(
            `<button class="page-btn ${i === page
              ? "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
              : ""
            }" data-page="${i}">${i}</button>`
          );
        }

        if (page < totalPages) {
          paginationDiv.append(
            `<button class="page-btn" data-page="${page + 1}">Next</button>`
          );
        }
      }

      paginationInfo.html(
        `Showing <b>${(page - 1) * limit + 1}</b> to <b>${Math.min(
          page * limit,
          res.total
        )}</b> of <b>${res.total}</b> trades`
      );
    }
  );
}

$(document).on("click", ".page-btn", function () {
  const selectedPage = parseInt($(this).data("page"));
  currentPage = selectedPage;
  loadTrades(currentPage);
});


function loadTopTrades() {
  $.post(base_url + "getTopTrades", {}, function (res) {
    const container = $("#topTradesContainer");
    container.empty();

    if (!res.success || res.trades.length === 0) {
      container.html(`
  <div class="flex flex-col items-center justify-center text-center p-6">
    <i class="fas fa-exclamation-triangle text-4xl text-gray-400 dark:text-gray-500 mb-3"></i>
    <p class="text-base text-gray-700 dark:text-gray-300 font-medium">
      No top trades yet. Start logging your trades to see them here.
    </p>
  </div>
`);
      return;
    }

    const icons = ["trophy", "medal", "award"];
    res.trades.forEach((trade, index) => {
      const date = new Date(trade.datetime).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      });
      const rr = trade.rr_ratio
        ? parseFloat(trade.rr_ratio).toFixed(4)
        : "1.0000";
      const icon = icons[index] ?? "award";
      const pnl = parseFloat(trade.pnl_amount).toFixed(2);
      const currency = trade.currency || "₹";

      container.append(`
        <div class="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 group transition-colors">
          <div class="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 mr-4">
            <i class="fas fa-${icon} text-xl"></i>
          </div>
          <div class="flex-1">
            <div class="flex justify-between items-center">
              <h4 class="font-medium text-gray-900 dark:text-gray-100">${trade.symbol}</h4>
              <span class="text-green-600 dark:text-green-400 font-medium">+${currency}${pnl}</span>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${date} • 1:${rr} R:R</p>
          </div>
        </div>
      `);
    });
  });
}


function getEquityCurve() {
  $.post(base_url + "getEquityCurve", function (res) {
    if (res.success) {
      const ctx = document.getElementById("equityChart").getContext("2d");

      // 🔥 DESTROY previous chart
      if (equityChartInstance) {
        equityChartInstance.destroy();
      }

      // ✅ CREATE new chart
      equityChartInstance = new Chart(ctx, {
        type: "bar", // 🔄 CHANGED from "line" to "bar"
        data: {
          labels: res.labels,
          datasets: [
            {
              label: "Equity",
              data: res.equity,
              backgroundColor: "#3B82F6", // solid bar color
              borderRadius: 4, // optional: rounded bars
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              title: { display: true, text: "Date" },
              grid: { display: false },
            },
            y: {
              title: { display: true, text: "Equity" },
              beginAtZero: true,
            },
          },
        },
      });


      // ✅ Update quick stats
      $("#chartHighest").text("₹" + res.highest.toLocaleString());
      $("#chartLowest").text("₹" + res.lowest.toLocaleString());
      $("#chartVolatility").text(res.volatility + "%");
      $("#chartTrend").html(
        res.trend === "Bullish"
          ? '<i class="fas fa-arrow-up"></i> Bullish'
          : '<i class="fas fa-arrow-down"></i> Bearish'
      );
    }

    // setTimeout(function () {
    //   let canvas = document.getElementById("equityChart");
    //   canvas.style.width = "100%";
    //   canvas.style.height = "100%";
    // },1000)
  });
}

function getMostTradedSymbols() {
  $.post(base_url + "getMostTradedSymbols", function (response) {
    const container = $("#mostTradedSymbols");
    container.empty();

    if (response.success && response.data.length > 0) {
      response.data.forEach((item) => {
        const html = `
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-gray-900 dark:text-gray-100">${item.symbol}</span>
              <span class="text-blue-600 dark:text-blue-400">${item.trade_count} trade${item.trade_count > 1 ? "s" : ""}</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
              <div class="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300" style="width: ${item.percent}%"></div>
            </div>
          </div>
        `;
        container.append(html);
      });
    } else {
      container.html(`
        <div class="flex flex-col items-center justify-center text-center py-6">
          <i class="fas fa-ghost text-5xl text-gray-400 dark:text-gray-500 mb-3"></i>
          <p class="text-base text-gray-700 dark:text-gray-300 font-medium">
            No symbols traded yet.
          </p>
        </div>
      `);
    }
  });
}