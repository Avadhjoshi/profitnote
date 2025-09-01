const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
let currencySymbol = '₹';

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');

        // Reset all buttons
        tabButtons.forEach(btn => {
            btn.classList.remove('active', 'text-blue-600', 'dark:text-blue-400', 'border-b-2', 'border-blue-600', 'dark:border-blue-400');
            btn.classList.add('text-gray-600', 'dark:text-gray-400');
        });

        // Activate clicked button
        button.classList.add('active', 'text-blue-600', 'dark:text-blue-400');
        button.classList.remove('text-gray-600', 'dark:text-gray-400');

        // Toggle content visibility
        tabContents.forEach(content => {
            if (content.getAttribute('data-tab-content') === targetTab) {
                content.classList.remove('hidden');
            } else {
                content.classList.add('hidden');
            }
        });
    });
});


$(document).ready(function () {
    loadTradePerformanceCard()
    loadDailyPerformanceCard()
    loadTimeMetrics()
    loadRiskMetrics()
    loadEmotionMetrics()
    loadTargetOutcome()
    loadSetupEffect()
    symbolFrequency()
    avgRRByEmotion()
    getTradingOutcomes()
    loadTradeExecution()
    loadDailyTradeActivity()
    getQuantityAnalysis()
    getCapitalUsage()
    fetchPerformance();
});

$('#rangeFilter').change(function () {
    loadTradePerformanceCard()
    loadDailyPerformanceCard()
    loadTimeMetrics()
    loadRiskMetrics()
    loadEmotionMetrics()
    loadTargetOutcome()
    loadSetupEffect()
    symbolFrequency()
    avgRRByEmotion()
    getTradingOutcomes()
    loadTradeExecution()
    loadDailyTradeActivity()
    getQuantityAnalysis()
    getCapitalUsage()
    fetchPerformance();
})

$('#marketTypeFilter').change(function () {

    if ($(this).val() == 1) {
        currencySymbol = '₹';
        $('.currencySymbol').text(currencySymbol)
    }
    else{
        currencySymbol = '$';
        $('.currencySymbol').text(currencySymbol)
    }
    
    loadTradePerformanceCard()
    loadDailyPerformanceCard()
    loadTimeMetrics()
    loadRiskMetrics()
    loadEmotionMetrics()
    loadTargetOutcome()
    loadSetupEffect()
    symbolFrequency()
    avgRRByEmotion()
    getTradingOutcomes()
    loadTradeExecution()
    loadDailyTradeActivity()
    getQuantityAnalysis()
    getCapitalUsage()
    fetchPerformance();
})

function loadTradePerformanceCard() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        url: base_url + 'getTradePerformance',
        type: 'POST',
        data: { rangeFilter, marketTypeFilter },
        dataType: 'JSON',
        success: function (res) {
            $('.positive').eq(0).text(res.win);
            $('.negative').eq(0).text(res.loss);
            $('.neutral').eq(0).text(res.breakeven);

            $('.stat-card').eq(0).find('p.font-medium').text(`${currencySymbol}${res.avgWin.toLocaleString()}`);
            $('.stat-card').eq(1).find('p.font-medium').text(`-${currencySymbol}${res.avgLoss.toLocaleString()}`);
            $('.stat-card').eq(2).find('p.font-medium').text(`${res.winRate}%`);
            $('.stat-card').eq(3).find('p.font-medium').text(`${currencySymbol}${res.expectancy.toLocaleString()}`);
        }
    });
}

function loadDailyPerformanceCard() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        url: base_url + 'getDailyPerformance',
        type: 'POST',
        data: { rangeFilter, marketTypeFilter },
        dataType: 'JSON',
        success: function (res) {
            $('#dailyPositive').text(res.winDays);
            $('#dailyNegative').text(res.lossDays);
            $('#dailyBreakeven').text(res.breakevenDays);

            $('.stat-card').eq(4).find('p.font-medium').text(`${currencySymbol}${res.bestDay.toLocaleString()}`);
            $('.stat-card').eq(5).find('p.font-medium').text(`${currencySymbol}${res.worstDay.toLocaleString()}`);
            $('.stat-card').eq(6).find('p.font-medium').text(`${currencySymbol}${res.avgWinDay.toLocaleString()}`);
            $('.stat-card').eq(7).find('p.font-medium').text(`${currencySymbol}${res.avgLossDay.toLocaleString()}`);
        }
    });
}

function loadTimeMetrics() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        type: "POST",
        url: base_url + "getTimeMetrics",
        data: { rangeFilter, marketTypeFilter },
        dataType: "JSON",
        success: function (res) {
            $('.trading-days').text(res.tradingDays);
            $('.consec-win').text(res.consecWinDays).addClass('positive');
            $('.consec-loss').text(res.consecLossDays).addClass('negative');
            $('.most-day').text(res.mostProfitableDay).addClass('positive');
            $('.least-day').text(res.leastProfitableDay).addClass('negative');
        }
    });
}

function loadRiskMetrics() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        type: 'POST',
        url: base_url + 'getRiskManagementMetrics',
        data: { rangeFilter, marketTypeFilter },
        dataType: 'json',
        success: function (res) {
            $('.planned-r').text('1:' + res.planned_r_multiple);
            $('.realized-r').text('1:' + res.realized_r_multiple);
            $('.avg-loss').text(res.avg_loss);
            $('.max-drawdown').text(res.max_drawdown);
            $('.expectancy').text(res.expectancy);
        }
    });
}

function loadEmotionMetrics() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.post(base_url + 'getEmotionalStateMetrics', { rangeFilter, marketTypeFilter }, function (response) {
        $('#emotionsContainer').empty()
        response.forEach(item => {
            $('#emotionsContainer').append(`
            <div class="flex justify-between">
                <span class="text-sm text-gray-600 dark:text-gray-400">${item.emotion}</span>
                <span class="font-medium">${item.percentage}%</span>
            </div>
        `);
        });
    });
}

function loadTargetOutcome() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        url: base_url + 'getTargetOutcomeMetrics', // adjust path to your controller method
        type: 'POST',
        data: { rangeFilter, marketTypeFilter }, // or hardcode like: { rangeFilter: 3 }
        dataType: 'json',
        success: function (response) {
            $('.target-achieved').text(response.target_achieved + '% of trades');
            $('.target-missed').text(response.target_missed + '% of trades');
            $('.stopped-before-target').text(response.stopped_before_target + '% of trades');
            $('.avg-r-achieved').text('1:' + response.avg_r_on_achieved);
            $('.avg-r-missed').text('1:' + response.avg_r_on_missed);
        },
        error: function () {
            console.error('Failed to fetch target outcome metrics.');
        }
    });
}

function loadSetupEffect() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        url: base_url + 'getSetupEffectiveness',
        type: 'POST',
        data: { rangeFilter, marketTypeFilter },
        dataType: 'json',
        success: function (response) {
            const container = $('.setup-effectiveness-container');
            container.empty();

            response.forEach(item => {
                container.append(`
                <div class="flex justify-between">
                    <span class="text-sm text-gray-600 dark:text-gray-400">${item.strategy}</span>
                    <span class="font-medium">${item.win_rate}% win rate</span>
                </div>
            `);
            });
        },
        error: function () {
            console.error('Failed to fetch setup effectiveness data.');
        }
    });
}

function symbolFrequency() {
    let rangeFilter = $('#rangeFilter').val();
    let marketTypeFilter = $('#marketTypeFilter').val();
    $.ajax({
        url: base_url + 'getSymbolFrequency',
        method: 'POST',
        data: { rangeFilter, marketTypeFilter },
        dataType: 'json',
        success: function (data) {
            const container = $('.symbol-frequency-container');
            container.empty();

            // Check if essential data exists and is valid
            if (
                data &&
                data.most_traded && data.most_profitable &&
                data.least_profitable && data.highest_win_rate &&
                data.lowest_win_rate
            ) {
                container.append(`
                    <div class="flex justify-between">
                        <span class="text-sm text-gray-600 dark:text-gray-400">Most Traded Symbol</span>
                        <span class="font-medium">${data.most_traded.symbol} (${data.most_traded.percent}%)</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-sm text-gray-600 dark:text-gray-400">Most Profitable Symbol</span>
                        <span class="font-medium positive">${data.most_profitable.symbol} (+${currencySymbol}${Math.abs(data.most_profitable.amount)})</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-sm text-gray-600 dark:text-gray-400">Least Profitable Symbol</span>
                        <span class="font-medium negative">${data.least_profitable.symbol} (${currencySymbol}${data.least_profitable.amount})</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-sm text-gray-600 dark:text-gray-400">Highest Win Rate</span>
                        <span class="font-medium positive">${data.highest_win_rate.symbol} (${data.highest_win_rate.rate}%)</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-sm text-gray-600 dark:text-gray-400">Lowest Win Rate</span>
                        <span class="font-medium negative">${data.lowest_win_rate.symbol} (${data.lowest_win_rate.rate}%)</span>
                    </div>
                `);
            }
        },
        error: function () {
            console.error('Failed to fetch symbol frequency data');
        }
    });
}

function avgRRByEmotion() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        url: base_url + 'getAvgRRByEmotion',
        method: 'POST',
        data: { rangeFilter, marketTypeFilter },
        dataType: 'json',
        success: function (data) {
            const container = $('.avg-rr-by-emotion-container');
            container.empty();

            data.forEach(item => {
                let rrFormatted = '1:' + item.avg_rr;
                let rrClass = item.avg_rr >= 2 ? 'positive' : (item.avg_rr <= 1 ? 'negative' : '');

                container.append(`
                <div class="flex justify-between">
                    <span class="text-sm text-gray-600 dark:text-gray-400">When ${item.emotion.trim()}</span>
                    <span class="font-medium ${rrClass}">${rrFormatted}</span>
                </div>
            `);
            });
        },
        error: function () {
            console.error('Failed to fetch Avg R:R by Emotion');
        }
    });
}

function getTradingOutcomes() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        url: base_url + 'getTradingOutcomes',
        method: 'POST',
        data: { rangeFilter, marketTypeFilter },
        dataType: 'json',
        success: function (response) {
            const container = $('.trading-outcomes-container');
            container.empty();

            const colorClass = (label) => {
                if (label.toLowerCase().includes('success')) return 'positive';
                if (label.toLowerCase().includes('plan')) return 'positive';
                if (label.toLowerCase().includes('mistake')) return 'negative';
                return '';
            };

            response.summaries.forEach(summary => {
                let label = summary.summary;
                let count = summary.count || 0;
                let total = response.total_trades || 1;
                let cssClass = colorClass(label);

                container.append(`
                <div class="flex justify-between">
                    <span class="text-sm text-gray-600 dark:text-gray-400">${label}</span>
                    <span class="font-medium ${cssClass}">${count}/${total}</span>
                </div>
            `);
            });
        },
        error: function () {
            console.error('Failed to load trading outcomes');
        }
    });
}

function getTradesPerDay() {
    let rangeFilter = $('#rangeFilter').val()
    $.ajax({
        url: base_url + 'getTradesPerDay',
        type: 'POST',
        data: { rangeFilter },
        dataType: 'json',
        success: function (data) {
            const container = $('.trades-per-day-container');
            container.empty();

            const metricHtml = (label, value, cls = '') => `
            <div class="flex justify-between">
                <span class="text-sm text-gray-600 dark:text-gray-400">${label}</span>
                <span class="font-medium ${cls}">${value}</span>
            </div>`;

            container.append(metricHtml('Maximum', data.max));
            container.append(metricHtml('Minimum', data.min));
            container.append(metricHtml('Average', data.avg));
            container.append(metricHtml('Winning Trades', data.wins, 'positive'));
            container.append(metricHtml('Losing Trades', data.losses, 'negative'));
        },
        error: function () {
            console.error('Failed to load trades per day data.');
        }
    });
}

function getQuantityAnalysis() {
    $.post(base_url + "getQuantityAnalysis", {
        rangeFilter: $('#rangeFilter').val(),
        marketTypeFilter: $('#marketTypeFilter').val()
    }, function (res) {
        $('#qa-max-qty').text(res.max_qty);
        $('#qa-min-qty').text(res.min_qty);
        $('#qa-avg-qty').text(res.avg_qty);

        // Max PNL
        $('#qa-max-pnl')
            .text(`${res.max_qty_pnl >= 0 ? '+' : '-'}${currencySymbol}${Math.abs(res.max_qty_pnl).toLocaleString()}`)
            .removeClass('positive negative')
            .addClass(res.max_qty_pnl >= 0 ? 'positive' : 'negative');

        // Min PNL
        $('#qa-min-pnl')
            .text(`${res.min_qty_pnl >= 0 ? '+' : '-'}${currencySymbol}${Math.abs(res.min_qty_pnl).toLocaleString()}`)
            .removeClass('positive negative')
            .addClass(res.min_qty_pnl >= 0 ? 'positive' : 'negative');
    });
}

function getCapitalUsage() {
    $.post(base_url + "getCapitalUsage", {
        rangeFilter: $('#rangeFilter').val(),
        marketTypeFilter: $('#marketTypeFilter').val(),
    }, function (res) {
        $('#cu-max').text(`${currencySymbol}${Math.round(res.max_capital).toLocaleString()}`);
        $('#cu-min').text(`${currencySymbol}${Math.round(res.min_capital).toLocaleString()}`);
        $('#cu-avg').text(`${currencySymbol}${Math.round(res.avg_capital).toLocaleString()}`);

        $('#cu-max-pnl')
            .text(`${res.max_capital_pnl >= 0 ? '+' : '-'}${currencySymbol}${Math.abs(Math.round(res.max_capital_pnl)).toLocaleString()}`)
            .removeClass('positive negative')
            .addClass(res.max_capital_pnl >= 0 ? 'positive' : 'negative');

        $('#cu-min-pnl')
            .text(`${res.min_capital_pnl >= 0 ? '+' : '-'}${currencySymbol}${Math.abs(Math.round(res.min_capital_pnl)).toLocaleString()}`)
            .removeClass('positive negative')
            .addClass(res.min_capital_pnl >= 0 ? 'positive' : 'negative');
    });
}

function loadDailyTradeActivity() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        url: base_url + 'getDailyTradeActivity',
        type: 'POST',
        dataType: 'json',
        data: { rangeFilter, marketTypeFilter },
        success: function (res) {
            $('#avgTradesPerDay').text(res.avg_per_day);
            $('#maxTradesInDay').text(res.max_per_day);
            $('#oneTradeDays').text(res.one_trade_days);
            $('#overtradingDays').text(res.overtrading_days);
        },
        error: function (err) {
            console.error("Failed to load daily trade activity", err);
        }
    });
}

function loadTradeExecution() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        url: base_url + 'getTradeExecution',
        type: 'POST',
        dataType: 'json',
        data: { rangeFilter, marketTypeFilter },
        success: function (res) {
            $('#totalTrades').text(res.total_trades);
            $('#avgCapitalUsed').text(currencySymbol + Number(res.avg_capital).toLocaleString('en-IN'));
            $('#mostProfitableStrategy').text(res.best_strategy);
            $('#consecutiveWins').text(res.consecutive_wins);
            $('#consecutiveLosses').text(res.consecutive_losses);
        },
        error: function (err) {
            console.error('Error fetching trade execution stats', err);
        }
    });
}

function fetchPerformance() {
    let rangeFilter = $('#rangeFilter').val()
    let marketTypeFilter = $('#marketTypeFilter').val()
    $.ajax({
        url: base_url + 'get-weekday-performance',
        type: 'POST',
        data: { rangeFilter, marketTypeFilter },
        dataType: 'json',
        success: function (data) {
            ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(day => {
                let dayCap = day.charAt(0).toUpperCase() + day.slice(1);
                let win = data[dayCap]?.win_rate ?? '--';
                let rr = data[dayCap]?.avg_rr ?? '--';

                // Update Win Rate
                const $win = $('.win-' + day);
                $win.text(win + '%').removeClass('positive negative text-white');
                if (!isNaN(win)) {
                    if (win > 55) $win.addClass('positive');
                    else if (win < 45) $win.addClass('negative');
                    else $win.addClass('text-white');
                } else {
                    $win.addClass('text-white');
                }

                // Update Avg R:R
                const $rr = $('.rr-' + day);
                $rr.text(rr + 'R').removeClass('positive negative text-white');
                if (!isNaN(rr)) {
                    if (rr > 1.5) $rr.addClass('positive');
                    else if (rr < 1.0) $rr.addClass('negative');
                    else $rr.addClass('text-white');
                } else {
                    $rr.addClass('text-white');
                }
            });
        }
    });
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}