let currencySymbol = '₹';

$(document).ready(function () {
    fetchStrategyCards();
    loadTrades();
});

$('#strategyFilter').on('change', function () {
    fetchStrategyCards();
});

$('#marketTypeFilter').on('change', function () {
    if ($(this).val() == 1) {
        currencySymbol = '₹';
        $('.currencySymbol').text(currencySymbol)
    }
    else {
        currencySymbol = '$';
        $('.currencySymbol').text(currencySymbol)
    }
    fetchStrategyCards();
    loadTrades();
});

$('#addStrategyBtn').click(function () {
    $('#modal-backdrop').removeClass('hidden')
    $('#strategy-modal').removeClass('hidden')
})

function closeStratModal() {
    $('#modal-backdrop').addClass('hidden')
    $('#strategy-modal').addClass('hidden')
}

function fetchStrategyCards() {
    let months = $('#strategyFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        url: base_url + 'fetchStrategyPerformance',
        method: 'POST',
        data: { months, marketTypeFilter },
        dataType: 'json',
        success: function (response) {
            const container = $('#cardView');
            container.empty();

            if (!response.length) {
                container.append(`<div class="col-span-3 text-center py-10">
                                    <div class="flex justify-center mb-4">
                                        <i class="fas fa-chart-line text-4xl text-gray-400"></i>
                                    </div>
                                    <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-200">No Strategies Found</h3>
                                    <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">
                                        Try a different time range or start recording your trades.
                                    </p>
                                </div>
                                `);
                return;
            }

            response.forEach(card => {
                const isProfit = parseFloat(card.total_profit.replace(/[^\d.-]/g, '')) > 0;
                const profitClass = isProfit ? 'text-green-500' : 'text-red-500';
                const winRateColor = card.win_rate >= 50 ? 'bg-green-500' : 'bg-red-500';

                const buttonClass = `edit-btn px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-full text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition ${card.is_owner ? '' : 'hidden'}`;

                const buttonHtml = `
    <button class="${buttonClass}" data-strategy="${card.id}">
        <i class="fas fa-edit mr-1"></i> Edit
    </button>
`;

                const cardHtml = `
    <div class="strategy-card bg-white dark:bg-dark-800 rounded-lg shadow-md overflow-hidden transition-all duration-300">
        <div class="p-6">
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100">${card.strategy}</h3>
                    <p class="text-gray-600 dark:text-gray-400">Strategy Usage</p>
                </div>
                <span class="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm font-medium">${card.usage_percent}%</span>
            </div>
            <div class="mt-6 grid grid-cols-2 gap-4">
                <div>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">Profit Factor</p>
                    <p class="text-gray-800 dark:text-gray-200 font-semibold">${card.profit_factor}</p>
                </div>
                <div>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">Risk/Trade</p>
                    <p class="text-gray-800 dark:text-gray-200 font-semibold">${card.avg_risk}</p>
                </div>
                <div>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">Total Profit</p>
                    <p class="${profitClass} font-semibold">${currencySymbol}${card.total_profit.replace(/[^\d.-]/g, '')}</p>
                </div>
                <div>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">Win Rate</p>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-1">
                        <div class="${winRateColor} h-2.5 rounded-full" style="width: ${card.win_rate}%"></div>
                    </div>
                </div>
            </div>
        </div>
        <div class="px-6 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-100 dark:border-gray-600 flex justify-between">
            <a href="#" data-strategy="${card.id}" class="view-details-btn text-primary-500 dark:text-primary-400 font-medium text-sm hover:underline">View Details</a>
            ${buttonHtml}
        </div>
    </div>`;

                container.append(cardHtml);
            });

        },
        error: function () {
            $('#cardView').html('<p class="text-red-600">Failed to load strategies.</p>');
        }
    });
}

let editingStrategyId = "";

$(document).on('click', '.edit-btn', function () {
    let id = $(this).data('strategy');
    $.ajax({
        type: "POST",
        url: base_url + "getEditStrategyData",
        data: { id },
        dataType: "json",
        success: function (response) {
            if (response.success) {
                $('#editStrategyModal').css('display', 'block')
                $('#editStrategyName').val(response.data.strategy)
                $('#editStrategyDescription').val(response.data.description)
                editingStrategyId = response.data.id;
            }
        }
    });
})

function updateStrategy(postUrl) {
    const name = $('#editStrategyName').val().trim();
    const description = $('#editStrategyDescription').val().trim();

    // Clear previous errors
    $('.error-message').remove();

    let hasError = false;

    // Validate editingStrategyId
    if (!editingStrategyId) {
        createToast('error', 'Invalid Operation', 'No strategy selected for editing.');
        return;
    }

    // Validate name
    if (name === '') {
        $('#editStrategyName').after('<div class="error-message text-red-500 text-sm mt-1">Strategy name is required.</div>');
        hasError = true;
    }

    // Validate description
    if (description === '') {
        $('#editStrategyDescription').after('<div class="error-message text-red-500 text-sm mt-1">Description is required.</div>');
        hasError = true;
    }

    if (hasError) return;

    // Send AJAX
    $.ajax({
        type: 'POST',
        url: postUrl,
        data: {
            id: editingStrategyId,
            strategy: name,
            description: description
        },
        dataType: 'json',
        success: function (response) {
            if (response.success) {
                $('#editStrategyModal').css('display', 'none');
                createToast('success', 'Updated', 'Strategy updated successfully.');
                fetchStrategyCards(); // Refresh
            } else {
                createToast('error', 'Error', response.message || 'Update failed.');
            }
        },
        error: function () {
            createToast('error', 'Server Error', 'Could not update strategy. Try again later.');
        }
    });
}



function loadTrades(page = 1) {
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        url: base_url + 'recentTrades',
        method: 'POST',
        data: { page, marketTypeFilter },
        dataType: 'json',
        success: function (res) {
            const tbody = $('table tbody');
            tbody.empty();

            if (!res.trades.length) {
                tbody.append(`<tr><td colspan="5" class="text-center py-4 text-gray-500">No recent trades found.</td></tr>`);
                $('#tradePagination').empty();
                return;
            }

            res.trades.forEach(trade => {
                const typeClass = trade.trade_type == 1
                    ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                    : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';

                const typeLabel = trade.trade_type == 1 ? 'Long' : 'Short';
                const resultClass = trade.pnl_amount >= 0 ? 'text-green-500' : 'text-red-500';
                const resultValue = (trade.pnl_percent > 0 ? '+' : '') + parseFloat(trade.pnl_percent).toFixed(2) + '%';

                const row = `
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">${trade.strategy_name}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${trade.symbol}</td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${typeClass}">${typeLabel}</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold ${resultClass}">${resultValue}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${formatTimeAgo(trade.datetime)}</td>
                        </tr>`;
                tbody.append(row);
            });

            renderPagination(res.page, res.total_pages);
        }
    });
}

function renderPagination(current, total) {
    const container = $('#tradePagination');
    container.empty();

    // Previous Button
    container.append(`
        <button data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}
            class="px-3 py-1 rounded text-sm border dark:border-gray-600 ${current === 1 ? 'text-gray-400' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}">
            &laquo; Prev
        </button>
    `);

    // Page Numbers
    for (let i = 1; i <= total; i++) {
        const isActive = i === current;
        container.append(`
        <button data-page="${i}" class="px-3 py-1 rounded text-sm border ${isActive
                ? 'bg-blue-500 text-white border-blue-500 shadow font-semibold'
                : 'text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
            }">${i}</button>
    `);
    }


    // Next Button
    container.append(`
        <button data-page="${current + 1}" ${current === total ? 'disabled' : ''}
            class="px-3 py-1 rounded text-sm border dark:border-gray-600 ${current === total ? 'text-gray-400' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}">
            Next &raquo;
        </button>
    `);

    // Add click events
    container.find('button').on('click', function () {
        const page = $(this).data('page');
        if (page >= 1 && page <= total) {
            loadTrades(page);
        }
    });
}


// Helper to format datetime as "2h ago"
function formatTimeAgo(datetimeStr) {
    const datetime = new Date(datetimeStr);
    const now = new Date();
    const diff = Math.floor((now - datetime) / 1000); // seconds

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}



$(document).on('click', '.view-details-btn', function (e) {
    e.preventDefault();
    const strategyId = $(this).data('strategy');
    let months = $('#strategyFilter').val()
    $.ajax({
        url: base_url + 'getStrategyDetails',
        method: 'POST',
        data: { id: strategyId, months: months },
        dataType: 'json',
        success: function (res) {
            if (!res.success) return alert(res.message);

            // Update Modal
            $('#strategyName').text(res.strategy.strategy);
            $('#strategyDescription').text(res.strategy.description || 'No description provided.');
            $('#winRate').text(parseFloat(res.metrics.win_rate || 0).toFixed(2) + '%');
            $('#winRateBar').css('width', parseFloat(res.metrics.win_rate || 0).toFixed(0) + '%');
            $('#profitFactor').text(res.metrics.profit_factor ? parseFloat(res.metrics.profit_factor).toFixed(2) : 'N/A');
            $('#riskPerTrade').text(res.metrics.risk_per_trade ? parseFloat(res.metrics.risk_per_trade).toFixed(2) + '%' : 'N/A');
            const totalProfit = parseFloat(res.metrics.total_profit || 0);
            $('#totalProfit')
                .text((totalProfit >= 0 ? `+${currencySymbol}` : `-${currencySymbol}`) + Math.abs(totalProfit).toLocaleString())
                .removeClass('text-red-500 text-green-500')
                .addClass(totalProfit >= 0 ? 'text-green-500' : 'text-red-500');

            // Recent trades
            let tradesHtml = '';
            if (res.trades.length === 0) {
                tradesHtml = `<div class="p-3 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 rounded-lg">No trades found</div>`;
            } else {
                res.trades.forEach(trade => {
                    const tradeType = trade.trade_type == 1 ? 'Long' : 'Short';
                    const tradeColor = trade.pnl_percent >= 0 ? 'text-green-500' : 'text-red-500';
                    const timeAgo = timeSince(new Date(trade.datetime));
                    tradesHtml += `
                        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <div>
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">${trade.symbol}</p>
                                <p class="text-xs text-gray-500 dark:text-gray-400">${tradeType} • ${timeAgo}</p>
                            </div>
                            <span class="text-sm font-semibold ${tradeColor}">${trade.pnl_percent > 0 ? '+' : ''}${parseFloat(trade.pnl_percent).toFixed(2)}%</span>
                        </div>`;
                });
            }
            $('#strategyModal .space-y-3').html(tradesHtml);

            // Show modal
            $('#strategyModal').css('display', 'block');
        }
    });
});

// Time ago helper
function timeSince(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const intervals = [
        { label: 'year', seconds: 31536000 },
        { label: 'month', seconds: 2592000 },
        { label: 'day', seconds: 86400 },
        { label: 'hour', seconds: 3600 },
        { label: 'minute', seconds: 60 },
        { label: 'second', seconds: 1 }
    ];

    for (const interval of intervals) {
        const count = Math.floor(seconds / interval.seconds);
        if (count > 0) return rtf.format(-count, interval.label);
    }
    return 'just now';
}

// Close modal
$(document).on('click', '.close-modal', function () {
    $('#strategyModal').css('display', 'none');
});


function saveUserStrategy(postUrl) {
    let name = $('#strategyNameInput').val();
    let description = $('#strategyDesc').val();

    if (!name || !description) {
        createToast('error', 'Validation', 'Please fill all required fields!');
        return;
    }

    $.ajax({
        type: "POST",
        url: postUrl,
        data: { name, description },
        dataType: "JSON",
        success: function (response) {
            if (response.success) {
                createToast('success', 'Success', response.message);
                $('#strategyNameInput').val('');
                $('#strategyDesc').val('');
                closeStratModal()
            } else {
                createToast('error', 'Error', response.message);
            }
        },
        error: function () {
            createToast('error', 'Error', 'Something went wrong.');
        }
    });
}

function closeEditModal() {
    $('#editStrategyModal').css('display', 'none')
}