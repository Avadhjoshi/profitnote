let tradeData = {};
let currencySymbol = '₹';


document.addEventListener('DOMContentLoaded', function () {
    $('#marketTypeFilter').change(function () {
        if ($(this).val() == 1) {
            currencySymbol = '₹';
            $('.currencySymbol').text(currencySymbol)
        }
        else {
            currencySymbol = '$';
            $('.currencySymbol').text(currencySymbol)
        }

        let selectedYear = $('#calenderYear').val();
        let selectedMonth = $('#calenderMonth').val();
        loadCalendar(selectedYear, selectedMonth);
    })


    let calendarContainer = document.querySelector('.calendar-grid');

    function loadCalendar(year, month) {
        let marketTypeFilter = $('#marketTypeFilter').val();

        $.ajax({
            url: base_url + 'getTradesByMonth',
            method: 'GET',
            data: { year, month, marketTypeFilter },
            success: function (res) {
                // Assuming res is an array of daily trades with this structure per day:
                // { day: 1, pnl: 450, trades: [...], avgRiskReward: '1:2.1', winRate: '66%', totalTrades: 3 }

                tradeData = {}; // reset

                res.dailyData.forEach(item => {
                    let trades = item.trades || [];

                    tradeData[item.day] = {
                        totalPnl: (item.pnl >= 0 ? '+' : '-') + currencySymbol + Math.abs(item.pnl).toLocaleString(),
                        avgRiskReward: item.avgRiskReward || '1:0.0',
                        totalTrades: item.totalTrades || trades.length.toString(),
                        winRate: item.winRate || '0%',
                        trades: trades.map(trade => ({
                            symbol: trade.symbol,
                            side: trade.side,
                            size: trade.size,
                            entry: currencySymbol + parseFloat(trade.entry).toFixed(2),
                            exit: currencySymbol + parseFloat(trade.exit).toFixed(2),
                            pnl: (trade.pnl >= 0 ? '+' : '-') + currencySymbol + Math.abs(trade.pnl),
                            win: trade.win
                        }))
                    };
                });

                // Now render calendar
                renderCalendar(res.dailyData, year, month);
                updateStatCards(res.cards)
            }

        });
    }

    function updateStatCards(cards) {
        let formatChange = (value) => {
            let isPositive = value >= 0;
            let arrow = isPositive ? 'fa-arrow-up' : 'fa-arrow-down';
            let color = isPositive ? 'green' : 'red';
            let bg = isPositive ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300' :
                'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300';

            return `
            <span class="inline-flex items-center ${bg} px-3 py-1 rounded-full text-xs font-medium">
                <i class="fas ${arrow} mr-1.5 text-xs"></i> ${Math.abs(value)}%
            </span>
        `;
        };

        animateValue(document.getElementById('totalPnl'), 0, cards.totalPnl, 1000, currencySymbol);
        if (cards.totalPnl < 0) {
            $('#totalPnl').removeClass('text-green-600 dark:text-green-400').addClass('text-red-600 dark:text-red-400');
        }
        else{
            $('#totalPnl').removeClass('text-red-600 dark:text-red-400').addClass('text-green-600 dark:text-green-400');
        }
        document.getElementById('totalPnlChange').innerHTML = formatChange(cards.totalPnlChange);

        animateValue(document.getElementById('winRate'), 0, parseFloat(cards.winRate), 1000, '', '%');
        document.getElementById('winRateChange').innerHTML = formatChange(cards.winRateChange);

        animateValue(document.getElementById('totalTrades'), 0, cards.totalTrades);
        document.getElementById('totalTradesChange').innerHTML = formatChange(cards.totalTradesChange);

        document.getElementById('avgRiskReward').textContent = cards.avgRiskReward;
        document.getElementById('avgRiskRewardChange').innerHTML = formatChange(cards.avgRiskRewardChange);
    }

    function animateValue(el, start, end, duration = 800, prefix = '', suffix = '') {
        let startTimestamp = null;
        let step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            let progress = Math.min((timestamp - startTimestamp) / duration, 1);
            let value = Math.floor(progress * (end - start) + start);
            el.textContent = prefix + value.toLocaleString() + suffix;
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }


    function renderCalendar(data, year, month) {
        let daysInMonth = new Date(year, month, 0).getDate();
        let firstDay = new Date(year, month - 1, 1).getDay();

        let today = new Date();
        let isThisMonth = today.getFullYear() === parseInt(year) && (today.getMonth() + 1) === parseInt(month);
        let todayDate = today.getDate();

        let html = '';

        for (let i = 0; i < firstDay; i++) {
            html += `<div class="calendar-day cursor-pointer bg-white dark:bg-slate-800 rounded-lg"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            let trade = data.find(d => d.day == day);
            let isToday = isThisMonth && day === todayDate;
            let todayClass = isToday ? 'today' : '';

            if (trade) {
                let pnl = parseFloat(trade.pnl);
                let color = pnl > 0 ? 'text-green-600' : (pnl < 0 ? 'text-red-600' : 'text-gray-600');
                html += `
                <div data-day="${day}" class="calendar-day cursor-pointer rounded-lg flex flex-col items-center justify-center p-3 ${pnl > 0 ? 'profit' : 'loss'} ${todayClass}" data-day="${day}">
                    <span class="text-sm font-medium mb-1.5 dark:text-white">${day}</span>
                    <span class="desktop-value text-center hidden md:block text-base font-semibold ${color}">
                        ${pnl > 0 ? '+' : ''}${currencySymbol}${Math.abs(pnl)} <br> ${trade.trades.length} trade${trade.trades.length > 1 ? 's' : ''}
                    </span>
                    <span class="mobile-value text-center block md:hidden text-xs font-medium ${color}">
                        ${trade.trades.length} trade${trade.trades.length > 1 ? 's' : ''}
                    </span>
                </div>`;
            } else {
                html += `
                <div data-day="${day}" class="calendar-day cursor-pointer bg-white dark:bg-slate-800 rounded-lg flex flex-col items-center justify-center p-3 ${todayClass}" data-day="${day}">
                    <span class="text-sm font-medium dark:text-white">${day}</span>
                </div>`;
            }
        }

        calendarContainer.innerHTML = html;
    }


    function refreshCalendar() {
        let selectedYear = $('#calenderYear').val();
        let selectedMonth = $('#calenderMonth').val();
        loadCalendar(selectedYear, selectedMonth);
    }

    // Initial load
    let today = new Date();
    $('#calenderYear').val(today.getFullYear());
    $('#calenderMonth').val(today.getMonth() + 1);
    refreshCalendar();

    // Attach change event listeners
    $('#calenderMonth, #calenderYear').on('change', function () {
        refreshCalendar();
    });
});





function toggleView() {
    let isMobile = window.innerWidth < 768;
    let desktopElements = document.querySelectorAll('.desktop-value');
    let mobileElements = document.querySelectorAll('.mobile-value');

    desktopElements.forEach(el => {
        el.style.display = isMobile ? 'none' : 'block';
    });

    mobileElements.forEach(el => {
        el.style.display = isMobile ? 'block' : 'none';
    });
}

// Initialize and add resize listener
window.addEventListener('load', toggleView);
window.addEventListener('resize', toggleView);


// Function to open modal with day details
function openDayDetails(day) {
    let modal = document.getElementById('dayDetailsModal');
    let data = tradeData[day] || {
        totalPnl: `+${currencySymbol}0`,
        avgRiskReward: '0:0',
        totalTrades: '0',
        winRate: '0%',
        trades: []
    };

    // Update modal content
    document.getElementById('totalPnlModal').textContent = data.totalPnl;
    document.getElementById('totalPnlModal').className = `text-2xl font-bold ${data.totalPnl.startsWith('+') ? 'text-green-600 dark:text-green-400' : data.totalPnl.startsWith('-') ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`;
    document.getElementById('avgRiskRewardModal').textContent = data.avgRiskReward;
    document.getElementById('totalTradesModal').textContent = data.totalTrades;
    document.getElementById('winRateModal').textContent = data.winRate;

    let selYear = $('#calenderYear').val();
    let selMonth = $('#calenderMonth option:selected').text();
    let tradeDate = `${selMonth} ${day}, ${selYear}`;

    $('#tradeDate').text(tradeDate)

    // Update trades table
    let tableBody = document.getElementById('tradesTableBody');
    tableBody.innerHTML = '';

    if (data.trades.length === 0) {
        let row = document.createElement('tr');
        row.className = 'border-b dark:border-gray-700';
        row.innerHTML = `
                    <td colspan="6" class="py-4 px-4 text-center text-gray-500 dark:text-gray-400">No trades recorded for this day</td>
                `;
        tableBody.appendChild(row);
    } else {
        data.trades.forEach(trade => {
            let row = document.createElement('tr');
            row.className = `${trade.win ? 'win-trade' : 'loss-trade'}`;
            row.innerHTML = `
                        <td class="py-3 px-4 font-medium dark:text-white">${trade.symbol}</td>
                        <td class="py-3 px-4">
                            <span class="${trade.side == 1 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                                ${trade.side == 1 ? 'Long' : 'Short'}
                            </span>
                        </td>

                        <td class="py-3 px-4 dark:text-gray-300">${trade.size}</td>
                        <td class="py-3 px-4 dark:text-gray-300">${trade.entry}</td>
                        <td class="py-3 px-4 dark:text-gray-300">${trade.exit}</td>
                        <td class="py-3 px-4 text-right font-medium ${trade.pnl.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                            ${trade.pnl}
                        </td>
                    `;
            tableBody.appendChild(row);
        });
    }

    // Show modal
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Function to close modal
function closeModal() {
    let modal = document.getElementById('dayDetailsModal');
    modal.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

document.querySelector('.calendar-grid').addEventListener('click', function (e) {
    let dayEl = e.target.closest('.calendar-day[data-day]');
    if (dayEl) {
        // Remove selected class from all days
        document.querySelectorAll('.calendar-day').forEach(d => {
            d.classList.remove('selected-day');
        });

        // Add selected class to clicked day
        dayEl.classList.add('selected-day');

        // Open the trade details for this day
        let dayNumber = dayEl.getAttribute('data-day');
        openDayDetails(dayNumber);
    }
});


document.getElementById('closeModal').addEventListener('click', closeModal);
document.querySelector('.modal-overlay').addEventListener('click', closeModal);

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeModal(); c
    }
});

toggleView();