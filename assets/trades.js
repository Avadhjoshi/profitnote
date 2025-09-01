$(document).ready(function () {
    loadTrades();
});

let currentPage = 1;

function loadTrades(page = currentPage) {
    currentPage = page;

    let startDate = $('#startDate').val() || '';
    let endDate = $('#endDate').val() || '';

    let selectedStrategies = $('.filter-card input[type="checkbox"]:checked')
        .map(function () {
            return $(this).val();
        })
        .get()
        .join(',');

    // Handle direction = 0 as both 1 and 2 (null or blank means both)
    let direction = $('input[name="direction"]:checked').val();
    direction = direction === '' ? '0' : direction;

    let market_type = $('input[name="mkt_type"]:checked').val();
    market_type = market_type === '' ? '0' : market_type;

    let sortBy = $('#sortSelect').val()

    $.ajax({
        url: base_url + '/ajax-trades',
        type: 'GET',
        dataType: 'json',
        data: { page: page, perPage: 10, startDate, endDate, selectedStrategies, direction, sortBy, market_type },
        success: function (res) {
            renderTable(res.data);
            renderPagination(res.currentPage, res.totalPages);
            updateSummary(res.currentPage, res.perPage, res.total);
        }
    });
}

function renderTable(data) {
    const tbody = $('.trade-table-container tbody');
    tbody.empty();

    if (data.length === 0) {
        tbody.append('<tr><td colspan="8" class="text-center">No trades found</td></tr>');
        return;
    }

    data.forEach(trade => {
        const direction = trade.trade_type === '1' ? 'Long' : 'Short';
        const directionClass = direction === 'Long'
            ? 'dark:bg-green-800 bg-green-600 text-green-100'
            : 'dark:bg-red-800 bg-red-600 text-red-100';

        const entry = parseFloat(trade.entry_price);
        const stop = parseFloat(trade.stop_loss);
        const exit = parseFloat(trade.exit_price);

        const risk = Math.abs(entry - stop);

        const plAmount = parseFloat(trade.pnl_amount);
        const plPercent = parseFloat(trade.pnl_percent);

        // --- RR Ratio from response ---
        let rrRatio = 'N/A';
        let rrClass = 'rr-ratio rr-poor'; // Default to red

        if (typeof trade.rr_ratio !== 'undefined' && trade.rr_ratio !== null) {
            const ratio = parseFloat(trade.rr_ratio);
            const raw = ratio.toFixed(2).replace(/\.00$/, '');
            rrRatio = `1:${raw}`;

            if (ratio <= 1.0) {
                rrClass = 'rr-ratio rr-poor'; // Red
            } else if (ratio > 1.0 && ratio <= 1.5) {
                rrClass = 'rr-ratio rr-orange'; // Orange
            } else if (ratio > 1.5 && ratio <= 2.0) {
                rrClass = 'rr-ratio rr-medium'; // Yellow
            } else {
                rrClass = 'rr-ratio rr-good'; // Green
            }
        }

        const formatMoney = value => {
            const num = parseFloat(value);
            return '' + num.toLocaleString('en-IN', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }).replace(/\.00$/, '');
        };

        const formatPercent = value => {
            const num = parseFloat(value);
            return num.toFixed(2).replace(/\.00$/, '') + '%';
        };

        tbody.append(`
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${!trade.strategy || !trade.summary ? 'dark:bg-orange-500/5 bg-orange-500/10' : ''}"
    onclick="viewTrade('${trade.id}', '${rrRatio}')">

            <td class="px-6 py-4 text-sm whitespace-nowrap">${formatDate(trade.datetime)}</td>
            <td class="px-6 py-4 text-sm font-medium">${trade.symbol}</td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-xs font-medium rounded-full ${directionClass}">${direction}</span>
            </td>
            <td class="px-6 py-4 text-sm">
                <div>${formatMoney(entry)}</div>
                <div>${formatMoney(exit)}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-medium ${plAmount >= 0 ? 'text-green-500' : 'text-red-500'}">
                    ${plAmount >= 0 ? '+' : ''}${formatMoney(plAmount)}
                </div>
                <div class="text-xs ${plPercent >= 0 ? 'text-green-500' : 'text-red-500'}">
                    ${plPercent >= 0 ? '+' : ''}${formatPercent(plPercent)}
                </div>
            </td>
            <td class="px-6 py-4 text-sm text-center">
                <span class="${rrClass}">
                    ${rrRatio}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-center whitespace-nowrap">
                ${trade.strategy ? trade.strategy : '—'}
            </td>
            <td class="px-6 py-4 text-center text-sm">
                ${trade.summary && trade.color
                ? `<span class="px-2 py-1 text-xs font-medium rounded-full dark:bg-${trade.color}-800 bg-${trade.color}-600 text-${trade.color}-100 whitespace-nowrap">
                            ${trade.summary}
                       </span>`
                : '—'
            }
            </td>
            <td class="px-6 py-4 text-right">
                <button class="text-blue-600" onclick="event.stopPropagation(); getEditTradeData(${trade.id})">
                    <i class="fas ${!trade.strategy || !trade.summary ? 'fa-book-open' : 'fa-edit'}"></i>
                </button>

                <button class="text-red-600" onclick="event.stopPropagation(); confirmDelete(${trade.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `);
    });
}

function renderPagination(current, total) {
    const pagination = $('.pagination-container');
    pagination.empty();

    let buttons = '';

    // Prev
    buttons += `<button class="page-btn px-3 py-1 border rounded-lg ${current === 1 ? 'opacity-50 cursor-not-allowed' : ''}" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>`;

    // Page numbers
    for (let i = 1; i <= total; i++) {
        buttons += `<button class="page-btn px-3 py-1 border rounded-lg ${i === current ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}" data-page="${i}">
                ${i}
            </button>`;
    }

    // Next
    buttons += `<button class="page-btn px-3 py-1 border rounded-lg ${current === total ? 'opacity-50 cursor-not-allowed' : ''}" data-page="${current + 1}" ${current === total ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>`;

    pagination.append(buttons);
}

function updateSummary(currentPage, perPage, total) {
    const from = (currentPage - 1) * perPage + 1;
    const to = Math.min(currentPage * perPage, total);
    $('.pagination-summary').html(`
            Showing <span class="font-medium">${from}</span> to 
            <span class="font-medium">${to}</span> of 
            <span class="font-medium">${total}</span> trades
        `);
}

function formatDate(datetimeStr) {
    const date = new Date(datetimeStr);
    return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        // hour: '2-digit',
        // minute: '2-digit',
    });
}

$(document).on('click', '.pagination-container .page-btn', function () {
    const page = $(this).data('page');
    if (!$(this).prop('disabled')) {
        loadTrades(page);
    }
});

// Modal functionality
const addTradeBtn = document.getElementById('addTradeBtn');
const addTradeModal = document.getElementById('addTradeModal');
const closeTradeModal = document.getElementById('closeTradeModal');
const resetFormBtn = document.getElementById('resetFormBtn');
const saveTradeBtn = document.getElementById('saveTradeBtn');
const successModal = document.getElementById('successModal');
const closeSuccessModal = document.getElementById('closeSuccessModal');

addTradeBtn.addEventListener('click', () => {
    addTradeBtn.blur()
    addTradeModal.style.display = 'flex';
    $('#editId').val('');
    document.body.style.overflow = 'hidden';
    $('#trade-tab').trigger('click')
    $('btn-long').focus()
});

closeSuccessModal.addEventListener('click', () => {
    successModal.style.display = 'none';
    addTradeModal.style.display = 'none';
    $('#editId').val('');
    document.getElementById('tradeForm').reset();
    document.getElementById('confidenceValue').textContent = '5';
    document.getElementById('executionValue').textContent = '5';
    document.getElementById('previewContainer').innerHTML = '';
    selectedRuleIds.clear();
    renderSelectedRules();
});

// Close add trade modal
closeTradeModal.addEventListener('click', () => {
    addTradeModal.style.display = 'none';
    $('#editId').val('');
    document.body.style.overflow = 'auto';
});

// Close modal when clicking outside content
addTradeModal.addEventListener('click', (e) => {
    if (e.target === addTradeModal) {
        addTradeModal.style.display = 'none';
        $('#editId').val('');
        document.body.style.overflow = 'auto';
    }
});

// Reset form
resetFormBtn.addEventListener('click', () => {
    document.getElementById('tradeForm').reset();
    document.getElementById('confidenceValue').textContent = '5';
    document.getElementById('executionValue').textContent = '5';
    document.getElementById('previewContainer').innerHTML = '';
    selectedRuleIds.clear();
    renderSelectedRules();
});

// Tab switching
const tabButtons = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');

        // Update active tab button
        tabButtons.forEach(btn => {
            btn.classList.remove('active', 'text-gray-800', 'dark:text-gray-200');
            btn.classList.add('text-gray-500', 'dark:text-gray-400');
        });
        button.classList.add('active', 'text-gray-800', 'dark:text-gray-200');
        button.classList.remove('text-gray-500', 'dark:text-gray-400');

        // Update active tab content
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
    });
});

// Slider value display
const confidenceSlider = document.querySelector('input[type="range"]');
const confidenceValue = document.getElementById('confidenceValue');
const executionSlider = document.querySelectorAll('input[type="range"]')[1];
const executionValue = document.getElementById('executionValue');

if (confidenceSlider && confidenceValue) {
    confidenceSlider.addEventListener('input', () => {
        confidenceValue.textContent = confidenceSlider.value;
    });
}

if (executionSlider && executionValue) {
    executionSlider.addEventListener('input', () => {
        executionValue.textContent = executionSlider.value;
    });
}

// File upload preview
const fileUpload = document.querySelector('.file-upload');
const fileInput = document.querySelector('.file-upload input[type="file"]');
const previewContainer = document.getElementById('previewContainer');

if (fileUpload && fileInput && previewContainer) {
    fileUpload.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        previewContainer.innerHTML = '';

        Array.from(e.target.files).forEach(file => {
            if (!file.type.match('image.*')) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const preview = document.createElement('div');
                preview.className = 'relative group';
                preview.innerHTML = `
                            <div class="screenshot-thumbnail rounded-lg overflow-hidden h-32">
                                <img src="${event.target.result}" class="w-full h-full object-cover">
                            </div>
                            <button class="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                <i class="fas fa-times"></i>
                            </button>
                        `;
                preview.querySelector('button').addEventListener('click', () => {
                    preview.remove();
                });
                previewContainer.appendChild(preview);
            };
            reader.readAsDataURL(file);
        });
    });
}

const ruleSearch = document.getElementById('ruleSearch');
const ruleDropdown = document.getElementById('ruleDropdown');
const selectedRules = document.getElementById('selectedRules');
const hiddenContainer = document.getElementById('selectedRuleInputs');
const selectedRuleIds = new Set();

// Show dropdown
ruleSearch.addEventListener('focus', () => {
    ruleDropdown.classList.remove('hidden');
});

// Hide dropdown on blur
ruleSearch.addEventListener('blur', () => {
    setTimeout(() => ruleDropdown.classList.add('hidden'), 200);
});

// Filter rules as user types
ruleSearch.addEventListener('input', () => {
    const searchTerm = ruleSearch.value.toLowerCase();
    const items = ruleDropdown.querySelectorAll('div[data-rule]');

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? 'block' : 'none';
    });
});

// Handle dropdown selection
ruleDropdown.querySelectorAll('div[data-rule]').forEach(item => {
    item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const ruleId = String(item.getAttribute('data-rule'));

        if (!selectedRuleIds.has(ruleId)) {
            selectedRuleIds.add(ruleId);
            renderSelectedRules();
        }

        ruleSearch.value = '';
        ruleDropdown.classList.add('hidden');
        $('#ruleSearch').blur()
    });
});

// Render chips and hidden inputs
function renderSelectedRules() {
    selectedRules.innerHTML = '';
    hiddenContainer.innerHTML = '';

    selectedRuleIds.forEach(ruleId => {
        const ruleText = rules[ruleId] || '[Unknown Rule]';

        // Chip
        const chip = document.createElement('div');
        chip.className = 'bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full mr-2 mb-2 flex items-center';
        chip.innerHTML = `
            ${ruleText}
            <button type="button" class="ml-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" data-rule="${ruleId}">
                <i class="fas fa-times text-xs"></i>
            </button>
        `;
        selectedRules.appendChild(chip);

        // Hidden input
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'selected_rules[]';
        input.value = ruleId;
        hiddenContainer.appendChild(input);

        // Remove rule on chip close
        chip.querySelector('button').addEventListener('click', e => {
            e.stopPropagation();
            selectedRuleIds.delete(ruleId);
            renderSelectedRules();
        });
    });
}

// Call this to load selected rules (e.g. in edit mode)
function loadSelectedRules(ruleIdArray) {
    selectedRuleIds.clear();
    ruleIdArray.forEach(id => selectedRuleIds.add(String(id)));
    renderSelectedRules();
}


// Screenshot Preview Functionality
const screenshotPreview = document.querySelector('.screenshot-preview');
const previewImage = document.getElementById('preview-image');
const closePreview = document.querySelector('.close-preview');

function setupScreenshotPreview() {
    const thumbnails = document.querySelectorAll('#modal-screenshots img');

    thumbnails.forEach(thumbnail => {
        thumbnail.addEventListener('click', () => {
            const fullSizeSrc = thumbnail.getAttribute('data-src');
            previewImage.src = fullSizeSrc;
            screenshotPreview.classList.add('active');
        });
    });
}

if (closePreview) {
    closePreview.addEventListener('click', () => {
        screenshotPreview.classList.remove('active');
    });
}

if (screenshotPreview) {
    screenshotPreview.addEventListener('click', (e) => {
        if (e.target === screenshotPreview) {
            screenshotPreview.classList.remove('active');
        }
    });
}

let debounceTimer;

function calculateAmount() {
    const quantity = parseFloat($('#entry_quantity').val()) || 0;
    const price = parseFloat($('#entry_price').val()) || 0;
    const amount = quantity * price;

    $('#entry_amount').val(amount.toFixed(2));
}

function debounceCalculate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(calculateAmount, 500); // 500ms delay
}

// Attach to input events
$('#entry_quantity, #entry_price').on('input', debounceCalculate);

let debouncePnLTimer;

function calculatePnL() {
    const entryPrice = parseFloat($('#entry_price').val()) || 0;
    const exitPrice = parseFloat($('#exit_price').val()) || 0;
    const quantity = parseFloat($('#entry_quantity').val()) || 0;
    const tradeType = parseInt($('#trade_type').val()); // 1 = Long, 2 = Short

    let pnlAmount = 0;
    let pnlPercent = 0;

    if (entryPrice > 0 && quantity > 0) {
        if (tradeType === 1) {
            // Long: Buy low, sell high
            pnlAmount = (exitPrice - entryPrice) * quantity;
            pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        } else if (tradeType === 2) {
            // Short: Sell high, buy low
            pnlAmount = (entryPrice - exitPrice) * quantity;
            pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
        }
    }

    $('#pnlAmount').val(pnlAmount.toFixed(2));
    $('#pnlPercent').val(pnlPercent.toFixed(2));
}

function debounceCalculatePnL() {
    clearTimeout(debouncePnLTimer);
    debouncePnLTimer = setTimeout(calculatePnL, 500); // 500ms delay
}

$(document).ready(function () {
    $('#entry_price, #exit_price, #entry_quantity').on('input', debounceCalculatePnL);

    $('#btn-long').click(function () {
        // Make "Long" active
        $(this)
            .removeClass('border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300')
            .addClass('border-green-500 bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300');

        // Make "Short" inactive
        $('#btn-short')
            .removeClass('border-red-500 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300')
            .addClass('border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300');

        $('#trade_type').val(1)
        debounceCalculatePnL()
    });

    $('#btn-short').click(function () {
        // Make "Short" active
        $(this)
            .removeClass('border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300')
            .addClass('border-red-500 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300');

        // Make "Long" inactive
        $('#btn-long')
            .removeClass('border-green-500 bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300')
            .addClass('border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300');

        $('#trade_type').val(2)
        debounceCalculatePnL()
    });
});

function saveTrade(postUrl) {
    var isValid = true;
    var inputname = "";

    $('.tReq').each(function () {
        var value = $(this).val();
        if (!value) {
            inputname = $(this).data('inputname');
            isValid = false;
            return false;
        }
    });

    if (!isValid) {
        createToast('error', 'Validation Error', `${inputname} is required!`);
        return false;
    }

    // if ($('input[name="selected_rules[]"]').length === 0) {
    //     createToast('error', 'Validation Error', `Please select at least one rule.`);
    //     return false;
    // }

    const form = $('#tradeForm')[0];
    const formData = new FormData(form);

    // Disable the save button
    $('#saveTradeBtn').prop('disabled', true).text('Saving...');

    $.ajax({
        url: postUrl,
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        dataType: 'json',
        success: function (response) {
            if (response.status) {
                successModal.style.display = 'flex';
                $('#response_message').text(response.response_message);
                $('#todays_pnl').text(response.today_pnl)
                    .removeClass()
                    .addClass(`font-medium text-${response.today_color}-600`);
                $('#yesterdays_pnl').text(response.yesterday_pnl)
                    .removeClass()
                    .addClass(`font-medium text-${response.yesterday_color}-600`);
                $('#comparison_message').text(response.message);
                $('#message_icon').removeClass().addClass(`${response.message_icon} text-blue-500 mr-2`);
                loadTrades();
            } else {
                createToast('error', 'Error', 'Form submission failed.');
            }
        },
        error: function () {
            createToast('error', 'Server Error', 'An error occurred.');
        },
        complete: function () {
            // Re-enable the save button
            $('#saveTradeBtn').prop('disabled', false).text('Save Trade');
        }
    });
}


// success: function (response) {
//     if (response.status) {
//         const popup = response.popup;

//         // Set title and subtitle
//         document.querySelector('#successModal h3').innerText = popup.title;
//         document.querySelector('#successModal p').innerText = popup.subtitle;

//         // Update trade comparison section if available
//         if (popup.comparison) {
//             document.querySelector('#successModal .trade-comparison').style.display = 'block';

//             // Today's trade
//             document.querySelector('#successModal .trade-comparison .grid div:nth-child(1) .font-medium').innerText = popup.comparison.today;
//             document.querySelector('#successModal .trade-comparison .grid div:nth-child(1) .text-xs').innerText = popup.comparison.strategy;

//             // Yesterday's trade
//             document.querySelector('#successModal .trade-comparison .grid div:nth-child(2) .font-medium').innerText = popup.comparison.yesterday;
//             document.querySelector('#successModal .trade-comparison .grid div:nth-child(2) .text-xs').innerText = popup.comparison.yesterday_strategy;

//             // Improvement/decline message
//             document.querySelector('#successModal .trade-comparison .mt-3 span span').innerText = popup.message.match(/₹[0-9,\.]+/)[0];
//             document.querySelector('#successModal .trade-comparison .mt-3 span').innerHTML = `<i class="fas fa-chart-line text-blue-500 mr-2"></i>${popup.message}`;
//         } else {
//             document.querySelector('#successModal .trade-comparison').style.display = 'none';
//         }

//         // Show modal
//         document.getElementById('successModal').style.display = 'flex';
//         loadTrades();
//     } else {
//         createToast('error', 'Error', 'Form submission failed.');
//     }
// }

function confirmDelete(id) {
    showConfirmDialog({
        message: `Are you sure you want to delete this trade? This action cannot be undone.`,
        tradeId: id,
        action: 'delete',
        callback: deleteTrade
    });
}

function deleteTrade(id) {
    $.ajax({
        type: "POST",
        url: base_url + "deleteTrade",
        data: { id },
        dataType: "JSON",
        success: function (response) {
            if (response.status) {
                createToast('success', 'Success', response.message);
                loadTrades(); // Reload trades after successful deletion
            } else {
                createToast('error', 'Error', response.message || 'Failed to delete trade.');
            }
        },
        error: function (xhr, status, error) {
            // This handles network errors or unexpected server responses
            createToast('error', 'Error', 'An unexpected error occurred. Please try again.');
            console.error('AJAX Error:', status, error);
        }
    });
}

function viewTrade(id, rrRatio) {

    $.ajax({
        type: "POST",
        url: base_url + "viewTrade",
        data: { id },
        dataType: "JSON",
        success: function (response) {
            viewTradeDetailsModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            $('[data-tab="general"]').trigger('click');

            const trade = response.trade || {};

            const entry = parseFloat(trade.entry_price) || 0;
            const stop = parseFloat(trade.stop_loss) || 0;
            const target = parseFloat(trade.target) || 0;
            const direction = trade.trade_type === '1' ? 'Long' : 'Short';

            let riskPercent = 0;
            let rewardPercent = 0;

            if (entry > 0) {
                if (direction === 'Long') {
                    riskPercent = ((entry - stop) / entry) * 100;
                    rewardPercent = ((target - entry) / entry) * 100;
                } else {
                    riskPercent = ((stop - entry) / entry) * 100;
                    rewardPercent = ((entry - target) / entry) * 100;
                }
            }

            riskPercent = isNaN(riskPercent) ? '-' : riskPercent.toFixed(2).replace(/\.00$/, '');
            rewardPercent = isNaN(rewardPercent) ? '-' : rewardPercent.toFixed(2).replace(/\.00$/, '');
            const riskRewardString = `${riskPercent}% / ${rewardPercent}%`;

            const expectedRR = formatRRR(entry, stop, target, trade.trade_type);

            $('#viewSymbol').text(trade.symbol || '—');
            $('#viewStrategy, #viewStrategyBadge').text(trade.strategy || '—');
            $('#viewRrRatio').text(expectedRR || '—');
            $('#viewActualRR').text(rrRatio || '—');
            $('#viewOutcome').text(trade.summary || '—');
            $('#viewPositionSize').text(`${trade.entry_quantity || 0} Qty`);
            $('#viewRiskPercent').text(riskRewardString);

            $('#viewEntryPrice').text(formatCash(trade.entry_price || 0));
            $('#viewExitPrice').text(formatCash(trade.exit_price || 0));
            $('#viewStopLoss').text(formatCash(trade.stop_loss || 0));
            $('#viewTarget').text(formatCash(trade.target || 0));
            $('#viewPnl').text(formatCash(trade.pnl_amount || 0));

            const directionClass = direction === 'Long' ? 'text-green-500' : 'text-red-500';

            $('#viewDirection')
                .text(direction)
                .removeClass('text-green-500 text-red-500')
                .addClass(directionClass);

            const pnlAmount = parseFloat(trade.pnl_amount) || 0;
            const pnlClass = pnlAmount >= 0 ? 'text-green-500' : 'text-red-500';

            $('#viewPnl')
                .text(formatCash(pnlAmount))
                .removeClass('text-green-500 text-red-500')
                .addClass(pnlClass);

            $('#viewPnlPercent')
                .text(`${trade.pnl_percent || '0'}%`)
                .removeClass('text-green-500 text-red-500')
                .addClass(pnlClass);

            const confidence = parseFloat(trade.confidence);
            $('#viewConfidence').css('width', `${isNaN(confidence) ? 0 : confidence * 10}%`);
            $('#viewConfidenceTExt').text(isNaN(confidence) ? '0' : confidence);

            const satisfaction = parseFloat(trade.satisfaction);
            $('#viewSatisfaction').css('width', `${isNaN(satisfaction) ? 0 : satisfaction * 10}%`);
            $('#viewSatisfactionText').text(isNaN(satisfaction) ? '0' : satisfaction);

            $('#viewEmotion').text(trade.emotion || '—');
            $('#viewRationale').text(trade.rationale || '—');
            $('#viewLesson').text(trade.lesson || '—');

            const mistakesContainer = $('#viewMistakesContainer');
            mistakesContainer.empty();

            if (!response.mistakes || response.mistakes.length === 0) {
                mistakesContainer.append(`
                    <div class="bg-white dark:bg-gray-600 rounded-lg overflow-hidden mb-2">
                        <input type="checkbox" id="mistake_nm" class="hidden">
                        <label for="mistake_nm" class="flex items-center justify-between p-3 cursor-pointer">
                            <div class="flex items-center">
                                <div class="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mr-3">
                                    <i class="fas fa-check text-green-500 text-xs"></i>
                                </div>
                                <span class="font-medium text-gray-800 dark:text-gray-200">No mistakes recorded for this trade.</span>
                            </div>
                        </label>
                        <div class="dropdown-content"><div class="px-4 pb-3 text-sm text-gray-600 dark:text-gray-300">...</div></div>
                    </div>
                `);
            } else {
                $.each(response.mistakes, function (m, mistake) {
                    mistakesContainer.append(`
                        <div class="bg-white dark:bg-gray-600 rounded-lg overflow-hidden mb-2">
                            <input type="checkbox" id="mistake_${m}" class="hidden">
                            <label for="mistake_${m}" class="flex items-center justify-between p-3 cursor-pointer">
                                <div class="flex items-center">
                                    <div class="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mr-3">
                                        <i class="fas fa-times text-red-500 text-xs"></i>
                                    </div>
                                    <span class="font-medium text-gray-800 dark:text-gray-200">${mistake.mistake || 'Unknown Mistake'}</span>
                                </div>
                            </label>
                            <div class="dropdown-content"><div class="px-4 pb-3 text-sm text-gray-600 dark:text-gray-300">...</div></div>
                        </div>
                    `);
                });
            }

            const viewImgContainer = $('#viewImgContainer');
            viewImgContainer.empty();

            if (!response.screenshots || response.screenshots.length === 0) {
                viewImgContainer.append(`
                    <div class="flex flex-col justify-center items-center w-full py-16 text-center text-gray-500 dark:text-gray-400 col-span-full">
                        <i class="fas fa-camera-retro text-6xl mb-4 text-gray-300 dark:text-gray-600"></i>
                        <p class="text-lg font-semibold">No screenshots available</p>
                        <p class="text-sm mt-1 text-gray-400">Nothing captured for this trade yet. Maybe next time!</p>
                    </div>
                `);
            } else {
                $.each(response.screenshots, function (s, scr) {
                    const filePath = scr.file_path ? `${base_url}writable/${scr.file_path}` : '';
                    viewImgContainer.append(`
                        <div class="relative group overflow-hidden rounded-xl shadow-md hover:shadow-lg transition-shadow">
                            <a href="${filePath}" class="glightbox" data-glightbox="title: Screenshot ${s + 1}">
                                <img src="${filePath}" alt="Screenshot ${s + 1}" class="w-full h-32 object-cover rounded-xl group-hover:scale-105 transition-transform duration-200" />
                                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-sm font-medium">
                                    View Screenshot
                                </div>
                            </a>
                        </div>
                    `);
                });
            }

            GLightbox({
                selector: '.glightbox',
                touchNavigation: true,
                loop: true,
                zoomable: true,
                openEffect: 'fade',
                closeEffect: 'fade',
                slideEffect: 'slide',
                autoplayVideos: false
            });
        }
    });
}


function formatRRR(entry, stop, target, tradeType) {
    entry = parseFloat(entry);
    stop = parseFloat(stop);
    target = parseFloat(target);

    if (isNaN(entry) || isNaN(stop) || isNaN(target)) return 'N/A';

    const risk = Math.abs(entry - stop);
    let reward = 0;

    if (tradeType === '1') {
        // Long trade: profit only if target > entry
        reward = Math.max(0, target - entry);
    } else {
        // Short trade: profit only if target < entry
        reward = Math.max(0, entry - target);
    }

    if (risk === 0) return 'N/A';

    const ratio = reward / risk;
    const formatted = ratio.toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).replace(/\.00$/, '');

    return `1:${formatted}`;
}

function formatCash(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return '0';
    return '' + num.toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).replace(/\.00$/, ''); // remove .00 if unnecessary
}

function formatPnl(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return '0';

    const absFormatted = Math.abs(num).toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).replace(/\.00$/, '');

    return absFormatted;
    // (num < 0 ? '-₹ ' : '+₹ ') + 
}

// view trade modal code
const viewTradeDetailsModal = document.getElementById('viewTradeDetailsModal');
const closeModalBtnDet = document.getElementById('closeModalDet');
const tabButtonsDet = document.querySelectorAll('.tab-btn-det');
const closeTradeViewButton = document.getElementById('closeTradeViewButton');
const tabContentsDet = document.querySelectorAll('.tab-content-det');
const emojiSelectors = document.querySelectorAll('.emoji-selector');

// Close Modal
closeModalBtnDet.addEventListener('click', () => {
    viewTradeDetailsModal.classList.add('hidden');
    document.body.style.overflow = '';
});

closeTradeViewButton.addEventListener('click', () => {
    viewTradeDetailsModal.classList.add('hidden');
    document.body.style.overflow = '';
});

// Close modal when clicking outside
viewTradeDetailsModal.addEventListener('click', (e) => {
    if (e.target === viewTradeDetailsModal) {
        viewTradeDetailsModal.classList.add('hidden');
        document.body.style.overflow = '';
    }
});

// Tab Switching
tabButtonsDet.forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');

        // Update active tab button
        tabButtonsDet.forEach(btn => {
            btn.classList.remove('text-primary-light', 'dark:text-primary-dark', 'border-primary-light', 'dark:border-primary-dark');
            btn.classList.add('text-gray-500', 'dark:text-gray-400', 'border-transparent');
        });
        button.classList.add('text-primary-light', 'dark:text-primary-dark', 'border-primary-light', 'dark:border-primary-dark');
        button.classList.remove('text-gray-500', 'dark:text-gray-400', 'border-transparent');

        // Update active tab content
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');
    });
});

// Dropdown functionality
document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
    toggle.addEventListener('change', function () {
        const content = this.nextElementSibling.nextElementSibling;
        const arrow = this.nextElementSibling.querySelector('.dropdown-arrow');

        if (this.checked) {
            arrow.classList.add('rotate-180');
        } else {
            arrow.classList.remove('rotate-180');
        }
    });
});

// Emoji selector functionality
emojiSelectors.forEach(selector => {
    selector.addEventListener('click', function () {
        emojiSelectors.forEach(el => el.classList.remove('active'));
        this.classList.add('active');
    });
});

// Simulate loading data
setTimeout(() => {
    document.querySelectorAll('.animate-pulse').forEach(el => {
        el.classList.remove('animate-pulse');
    });
}, 1500);




function showPopup(type) {
    const popupId = `${type}Popup`;
    document.getElementById(popupId).style.display = 'flex';
}



// edit
function getEditTradeData(id) {
    $.ajax({
        type: "POST",
        url: base_url + "getEditTradeData",
        data: { id },
        dataType: "JSON",
        success: function (response) {
            addTradeModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            $('#trade-tab').trigger('click')

            $('#editId').val(id);

            $('#symbol').val(response.trade.symbol)
            $('#market_type').val(response.trade.market_type)
            $('#datetime').val(response.trade.datetime)
            $('#entry_price').val(response.trade.entry_price)
            $('#entry_quantity').val(response.trade.entry_quantity)
            $('#entry_amount').val(response.trade.entry_amount)
            $('#exit_price').val(response.trade.exit_price)
            $('#pnlAmount').val(response.trade.pnl_amount)
            $('#pnlPercent').val(response.trade.pnl_percent)
            $('#stop_loss').val(response.trade.stop_loss)
            $('#target').val(response.trade.target)

            if (response.trade.trade_type == 1) {
                $('#btn-long').trigger('click');
            }
            else {
                $('#btn-short').trigger('click');
            }

            $('#strategy').val(response.trade.strategy)
            $('#outcome').val(response.trade.outcome)
            $('#rationale').val(response.trade.rationale)

            selectedRuleIds.clear();
            response.rules.forEach(r => {
                selectedRuleIds.add(r.rule_id);
            });
            renderSelectedRules();

            $('#confidence').val(response.trade.confidence)
            $('#confidenceValue').text(response.trade.confidence)

            $('#satisfaction').val(response.trade.satisfaction)
            $('#executionValue').text(response.trade.satisfaction)

            $('#emotion').val(response.trade.emotion)

            $('input[name="mistakes[]"]').prop('checked', false);

            response.mistakes.forEach(m => {
                $(`#mistake${m.mistake_id}`).prop('checked', true);
            });

            $('#lesson').val(response.trade.lesson)

            //             var screenshotPreviewContainer = $('#previewContainer');

            //             $.each(response.screenshots, function (s, scr) {
            //                 screenshotPreviewContainer.append(`
            //     <div class="relative group inline-block mr-2 mb-2 w-32 h-32">
            //         <div class="screenshot-thumbnail rounded-lg overflow-hidden w-full h-full">
            //             <img src="${base_url}public/${scr.file_path}" class="w-full h-full object-cover">
            //         </div>
            //         <button type="button" class="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity" onclick="removeScreenshot(this, '${scr.file_path}')">
            //             <i class="fas fa-times"></i>
            //         </button>
            //     </div>
            // `);
            //             })

            sliders.forEach(slider => {
                updateSliderBackground(slider);
                slider.addEventListener('input', function () {
                    updateSliderBackground(this);
                });
            });
        }
    });
}



// filters
// Modal toggle functionality
const filtermodal = document.getElementById('modalBackdrop');
document.getElementById('openModal').addEventListener('click', () => {
    filtermodal.classList.remove('hidden');
});

document.getElementById('closeModal').addEventListener('click', () => {
    filtermodal.classList.add('hidden');
});

// Close modal when clicking outside
filtermodal.addEventListener('click', (e) => {
    if (e.target === filtermodal) {
        filtermodal.classList.add('hidden');
    }
});

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !filtermodal.classList.contains('hidden')) {
        filtermodal.classList.add('hidden');
    }
});

// Add active class to filter cards when clicked
document.querySelectorAll('.filter-card').forEach(card => {
    const input = card.querySelector('input');

    input.addEventListener('change', () => {
        if (input.type === 'checkbox') {
            card.classList.toggle('active', input.checked);
        } else if (input.type === 'radio') {
            // Remove active class from all radio buttons in same name group
            const name = input.name;
            document.querySelectorAll(`input[type="radio"][name="${name}"]`).forEach(radio => {
                radio.closest('.filter-card').classList.remove('active');
            });

            if (input.checked) {
                card.classList.add('active');
            }
        }
    });

    // Optional: Clicking the card triggers input click
    card.addEventListener('click', (e) => {
        if (!e.target.matches('input')) {
            input.click();
        }
    });
});

document.getElementById('resetFilters').addEventListener('click', () => {
    // Reset checkboxes and radio buttons
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.checked = false;
    });

    // Remove active class from filter cards
    document.querySelectorAll('.filter-card').forEach(card => {
        card.classList.remove('active');
    });

    $('#startDate, #endDate').val('');

    loadTrades();
});


function applyFilters() {
    loadTrades();
    filtermodal.classList.add('hidden');
}

$(document).ready(function () {
    $('#sortSelect').change(function () {
        loadTrades();
    })
});


$('#fetchBrokerTrades').click(function () {
    $.ajax({
        type: "POST",
        url: base_url + "syncTrades",
        data: {
            // broker: 'kite'
        },
        dataType: "JSON",
        success: function (response) {
            if (response.success) {
                createToast('success', 'Sync trades', response.message || 'Trades synced successfully.');
                loadTrades();
            } else if (response.login_required && response.broker == 'kite') {
                createToast('warning', 'Kite Login Required', response.message);
                openKiteLoginIframe();
            } else {
                createToast('error', 'Sync trades', response.message || 'Trades sync failed.');
            }
        },
        error: function (xhr, status, error) {
            createToast('error', 'Sync trades', error || 'Trades sync failed.');
        }
    });
});

function openKiteLoginIframe() {
    const frame = document.getElementById("kiteLoginFrame");
    const modal = document.getElementById("kiteLoginModal");

    frame.src = base_url + "kite/kite-login"; // loads iframe with Kite login
    modal.classList.remove("hidden");

    // Listen for message from iframe (token passed via postMessage)
    window.addEventListener("message", function handleMessage(event) {
        if (event.data && event.data.token) {
            fetch(base_url + "kite/save-access-token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `request_token=${event.data.token}`
            }).then(() => {
                closeKiteLogin();                 // Close modal
                $('#fetchBrokerTrades').click();  // Re-trigger sync
                window.removeEventListener("message", handleMessage); // cleanup
            });
        }
    });
}

function closeModal(id) {
    $(id).removeClass('active').addClass('hidden')
}

function generateKiteToken(type, postUrl, requiredFieldsSelector, formSelector) {
    const $form = $(formSelector);
    const $button = $form.find('button[type="button"]');
    const $spinner = $button.find('#connect-spinner');
    const $tokenInput = $form.find('input[name="kite-tokenApiKey"]');
    const token = $tokenInput.val().trim();

    // Reset errors
    $form.find('.error-message').addClass('hidden');

    // Validate
    if (!token) {
        $tokenInput.next('.error-message').removeClass('hidden');
        return;
    }

    // Disable button and show spinner
    $button.prop('disabled', true);
    $spinner.removeClass('hidden');

    $.ajax({
        type: "POST",
        url: postUrl,
        data: { access_token: token },
        dataType: "json",
        success: function (response) {
            if (response.success) {
                createToast('success', 'Token Saved', response.message || 'Kite token saved successfully.');
                closeModal('#kite-token-popup');
                // $('#fetchBrokerTrades').click(); // Retry sync
            } else {
                createToast('error', 'Failed', response.message || 'Failed to save token.');
            }
        },
        error: function (xhr) {
            createToast('error', 'Error', xhr.responseJSON?.message || 'Something went wrong.');
        },
        complete: function () {
            $button.prop('disabled', false);
            $spinner.addClass('hidden');
        }
    });
}


function closeKiteLogin() {
    const modal = document.getElementById("kiteLoginModal");
    const tokenModal = document.getElementById("kite-token-popup");
    document.getElementById("kiteLoginFrame").src = "";
    modal.classList.add("hidden");

    tokenModal.classList.remove("hidden");
}

window.addEventListener("message", function handleMessage(event) {
    if (event.data && event.data.token && event.data.state) {
        fetch(base_url + "kite/save-access-token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `request_token=${event.data.token}&state=${event.data.state}`
        }).then(() => {
            closeKiteLogin();
            $('#fetchBrokerTrades').click();
            window.removeEventListener("message", handleMessage);
        });
    }
});

const sliders = document.querySelectorAll("input[type=range]");

function updateSliderBackground(slider) {
    const val = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--value', val + '%');
}

sliders.forEach(slider => {
    updateSliderBackground(slider);
    slider.addEventListener('input', function () {
        updateSliderBackground(this);
    });
});