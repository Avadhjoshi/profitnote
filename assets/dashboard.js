let pnlChartFilter = 'D';
let currencySymbol = '₹';

$('#rangeFilter').change(function () {
    getDashboardMetrics()
    fetchTopTrades()
    renderWinLossChart()
    showTraderConfidence()
    renderStrategyPnlChart()
    renderMostCommonMistakes()
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
    getDashboardMetrics()
    // loadTrades();
    getEquityChartData()
    fetchTopTrades()
    renderWinLossChart()
    showTraderConfidence()
    renderDailyPnlChart()
    renderStrategyPnlChart()
    renderMostCommonMistakes()
})



let winLossChart;

let strategyPnlChart;



let strategyChart;



// Update charts on theme change
darkModeToggle.addEventListener('change', function () {
    pnlChart.update();
    winLossChart.update();
    strategyChart.update();
});

// Simulate market sentiment movement
// setInterval(() => {
//     const indicator = document.querySelector('.sentiment-indicator');
//     const currentPos = parseInt(indicator.style.left || '65');
//     const newPos = Math.min(Math.max(currentPos + (Math.random() * 6 - 3), 0), 100);
//     indicator.style.left = `${newPos}%`;

//     // Update sentiment text
//     const sentimentText = document.querySelector('.text-center.text-sm');
//     let sentiment = '';
//     if (newPos < 30) sentiment = 'Strongly Bearish';
//     else if (newPos < 45) sentiment = 'Bearish';
//     else if (newPos < 55) sentiment = 'Neutral';
//     else if (newPos < 70) sentiment = 'Moderately Bullish';
//     else sentiment = 'Strongly Bullish';

//     sentimentText.textContent = `Current sentiment: ${sentiment} (${Math.round(newPos)}%)`;
// }, 3000);


// Modal functionality
const addTradeBtn = document.getElementById('addTradeBtn');
const addTradeBtn2 = document.getElementById('addTradeBtn2');
const addTradeModal = document.getElementById('addTradeModal');
const closeTradeModal = document.getElementById('closeTradeModal');
const resetFormBtn = document.getElementById('resetFormBtn');
const saveTradeBtn = document.getElementById('saveTradeBtn');
const successModal = document.getElementById('successModal');
const closeSuccessModal = document.getElementById('closeSuccessModal');



// Open add trade modal
addTradeBtn2.addEventListener('click', () => {
    addTradeModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    $('#trade-tab').trigger('click')
});

closeSuccessModal.addEventListener('click', () => {
    successModal.style.display = 'none';
    addTradeModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('tradeForm').reset();
    document.getElementById('confidenceValue').textContent = '5';
    document.getElementById('executionValue').textContent = '5';
    document.getElementById('previewContainer').innerHTML = '';
    selectedRuleIds.clear();
    renderSelectedRules();
});

addTradeBtn.addEventListener('click', () => {
    addTradeModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    $('#trade-tab').trigger('click')
});

// Close add trade modal
closeTradeModal.addEventListener('click', () => {
    addTradeModal.style.display = 'none';
    document.body.style.overflow = 'auto';
});

// Close modal when clicking outside content
addTradeModal.addEventListener('click', (e) => {
    if (e.target === addTradeModal) {
        addTradeModal.style.display = 'none';
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

// Enhanced Rules Selection
const ruleSearch = document.getElementById('ruleSearch');
const ruleDropdown = document.getElementById('ruleDropdown');
const selectedRules = document.getElementById('selectedRules');

// Track selected rules
const selectedRuleIds = new Set();

if (ruleSearch && ruleDropdown && selectedRules) {
    // Show dropdown when typing
    ruleSearch.addEventListener('focus', () => {
        ruleDropdown.classList.remove('hidden');
    });

    ruleSearch.addEventListener('blur', () => {
        setTimeout(() => ruleDropdown.classList.add('hidden'), 200);
    });

    ruleSearch.addEventListener('input', () => {
        const searchTerm = ruleSearch.value.toLowerCase();
        const items = ruleDropdown.querySelectorAll('div');

        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });

    // Add rule when clicked
    ruleDropdown.querySelectorAll('div').forEach(item => {
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const ruleId = item.getAttribute('data-rule');

            if (!selectedRuleIds.has(ruleId)) {
                selectedRuleIds.add(ruleId);
                renderSelectedRules();
            }

            ruleSearch.value = '';
            ruleDropdown.classList.add('hidden');
        });
    });
}

// Render selected rules as chips
function renderSelectedRules() {
    if (!selectedRules) return;

    selectedRules.innerHTML = '';

    // Clear previous hidden inputs
    const hiddenContainer = document.getElementById('selectedRuleInputs');
    hiddenContainer.innerHTML = '';

    selectedRuleIds.forEach(ruleId => {
        // --- Visible Chip ---
        const chip = document.createElement('div');
        chip.className = 'rule-chip';
        chip.innerHTML = `
            ${rules[ruleId]}
            <button class="ml-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" data-rule="${ruleId}">
                <i class="fas fa-times text-xs"></i>
            </button>
        `;
        selectedRules.appendChild(chip);

        // --- Hidden Input ---
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'selected_rules[]';
        hiddenInput.value = ruleId;
        hiddenContainer.appendChild(hiddenInput);

        // --- Remove chip + input ---
        chip.querySelector('button').addEventListener('click', (e) => {
            e.stopPropagation();
            selectedRuleIds.delete(ruleId);
            renderSelectedRules();
        });
    });
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


// RENDER TABLE
let currentPage = 1;





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

function confirmDelete(id) {
    showConfirmDialog({
        message: `Are you sure you want to delete this trade? This action cannot be undone.`,
        tradeId: id,
        action: 'delete',
        callback: deleteTrade
    });
}


// view trade modal code
const viewTradeDetailsModal = document.getElementById('viewTradeDetailsModal');
const closeModalBtnDet = document.getElementById('closeModalDet');
const closeTradeViewButton = document.getElementById('closeTradeViewButton');
const tabButtonsDet = document.querySelectorAll('.tab-btn-det');
const tabContentsDet = document.querySelectorAll('.tab-content-det');
const emojiSelectors = document.querySelectorAll('.emoji-selector');


// Lightbox functionality
$('#viewImgContainer').on('click', 'img', function () {
    var src = $(this).data('full');
    $('#lightboxImage').attr('src', src);
    $('#imgLightbox').removeClass('hidden');
});

$('#closeLightbox, #imgLightbox').on('click', function (e) {
    // Close only if clicked on overlay or close button
    if (e.target.id === 'imgLightbox' || e.target.id === 'closeLightbox') {
        $('#imgLightbox').addClass('hidden');
        $('#lightboxImage').attr('src', '');
    }
});

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


// Time slot selection
document.querySelectorAll('.time-slot').forEach(slot => {
    slot.addEventListener('click', () => {
        document.querySelectorAll('.time-slot').forEach(s =>
            s.classList.remove('selected', 'text-black', 'text-white', 'bg-blue-500', 'dark:bg-blue-500', 'dark:text-white')
        );
        slot.classList.add('selected', 'text-white', 'dark:text-white', 'bg-blue-500', 'dark:bg-blue-500');
        document.getElementById('selectedTimeSlot').value = slot.dataset.time;
    });
});



// edit

let equityChart;



$('.pnlChartFilter').click(function () {
    $('.pnlChartFilter').each(function () {
        $(this)
            .removeClass('bg-blue-500 dark:bg-blue-600 text-white')
            .addClass('bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-600');
    });

    $(this)
        .removeClass('bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-600')
        .addClass('bg-blue-500 dark:bg-blue-600 text-white');

    pnlChartFilter = $(this).text().trim(); // 'D', 'W', or 'M'
    getEquityChartData();
});



// 
const chartOptions = {
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false,
            labels: {
                color: '#e0e0e0',
                font: {
                    family: "'Montserrat', sans-serif"
                }
            }
        },
        tooltip: {
            backgroundColor: 'rgba(30, 30, 40, 0.95)',
            titleColor: '#e0e0e0',
            bodyColor: '#e0e0e0',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1
        }
    },
    scales: {
        x: {
            grid: {
                color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
                color: '#9ca3af'
            }
        },
        y: {
            grid: {
                color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
                color: '#9ca3af'
            }
        }
    }
};





function getGradientClass(index) {
    const gradients = [
        'bg-gradient-to-r from-red-500 to-orange-500',
        'bg-gradient-to-r from-red-400 to-orange-400',
        'bg-gradient-to-r from-red-300 to-orange-300',
        'bg-gradient-to-r from-red-200 to-orange-200'
    ];
    return gradients[index % gradients.length];
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