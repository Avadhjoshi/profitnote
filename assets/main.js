const darkModeToggle = document.getElementById('darkModeToggle');
const html = document.documentElement;
const sunIcon = document.getElementById('toggleSun');
const moonIcon = document.getElementById('toggleMoon');

// Load preference
/*const isDark = localStorage.getItem('darkMode') === 'true' ||
    (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches);

if (isDark) {
    html.classList.add('dark');
    darkModeToggle.checked = true;
    sunIcon.classList.add('hidden');
    moonIcon.classList.remove('hidden');
}

// Toggle
darkModeToggle.addEventListener('change', function () {
    const isChecked = this.checked;

    if (isChecked) {
        html.classList.add('dark');
        localStorage.setItem('darkMode', 'true');
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
    } else {
        html.classList.remove('dark');
        localStorage.setItem('darkMode', 'false');
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
    }
});
*/

// User dropdown toggle
const userMenuButton = document.getElementById('userMenuButton');
const userDropdown = document.getElementById('userDropdown');

userMenuButton.addEventListener('click', function () {
    userDropdown.classList.toggle('hidden');
});

// Close dropdown when clicking outside
document.addEventListener('click', function (event) {
    if (!userMenuButton.contains(event.target) && !userDropdown.contains(event.target)) {
        userDropdown.classList.add('hidden');
    }
});

const fab = document.getElementById('fab');

fab.addEventListener('click', function () {
    window.scrollTo({
        top: 0,
        behavior: 'smooth' // smooth scrolling effect
    });
});


// Sidebar toggle functionality
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');

sidebarToggle.addEventListener('click', function () {
    sidebar.classList.toggle('sidebar-open');
    sidebarOverlay.classList.toggle('active');
});

sidebarOverlay.addEventListener('click', function () {
    sidebar.classList.remove('sidebar-open');
    sidebarOverlay.classList.remove('active');
});

function createToast(type, title, message, duration = 5000) {
    const toastContainer = document.getElementById('toastContainer');
    const toastId = 'toast-' + Date.now();

    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.id = toastId;

    toast.innerHTML = `
                <div class="flex items-start">
                    <i class="fas ${icons[type]} toast-icon"></i>
                    <div class="toast-content">
                        <div class="toast-title">${title}</div>
                        <div class="toast-message">${message}</div>
                    </div>
                </div>
                <button class="toast-close" onclick="removeToast('${toastId}')">
                    <i class="fas fa-times"></i>
                </button>
                <div class="toast-progress">
                    <div class="toast-progress-bar" style="animation-duration: ${duration / 1000}s"></div>
                </div>
            `;

    toastContainer.appendChild(toast);

    // Show toast with animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Auto remove toast after duration
    if (duration) {
        setTimeout(() => {
            removeToast(toastId);
        }, duration);
    }

    return toastId;
}

function removeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (toast) {
        toast.classList.remove('show');
        toast.classList.add('hide');

        // Remove from DOM after animation
        setTimeout(() => {
            toast.remove();
        }, 300);
    }
}


const dialogState = {
    action: null,
    tradeId: null,
    callback: null
};

// Reusable confirm dialog
function showConfirmDialog(options) {
    const dialog = document.getElementById('confirmDialog');
    const message = document.getElementById('dialogMessage');

    // Set dialog content
    message.textContent = options.message || 'Are you sure you want to perform this action?';

    // Store action details
    dialogState.action = options.action;
    dialogState.tradeId = options.tradeId;
    dialogState.callback = options.callback;

    // Show dialog with animation
    dialog.classList.remove('hidden');
    setTimeout(() => {
        dialog.querySelector('div').classList.add('modal-animation-in');
    }, 10);
}

function closeDialog() {
    const dialog = document.getElementById('confirmDialog');
    dialog.querySelector('div').classList.remove('modal-animation-in');
    dialog.querySelector('div').classList.add('modal-animation-out');

    setTimeout(() => {
        dialog.classList.add('hidden');
        dialog.querySelector('div').classList.remove('modal-animation-out');
    }, 150);
}

function executeDialogAction() {
    if (dialogState.callback) {
        dialogState.callback(dialogState.tradeId);
    }
    closeDialog();
}

// Close modal when clicking outside
window.onclick = function (event) {
    const dialog = document.getElementById('confirmDialog');
    if (event.target == dialog) {
        closeDialog();
    }
}


$(document).ready(function () {
    fetchTickerData();

    function fetchTickerData() {
        $.ajax({
            url: "https://stoxis.in/fetchIndexPrices",
            method: "POST",
            data: {
                api_key: "fhgjdhgjhdgfjhjgfhhdfgjhkjdfhguregdfjg"
            },
            dataType: "json",
            success: function (result) {
                if (result.status && result.data) {
                    const tickerEl = $('#ticker-content');
                    tickerEl.empty(); // Clear previous data

                    result.data.forEach(function (item) {
                        const lp = parseFloat(item.chp);
                        const colorClass = lp >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                        const symbol = lp >= 0 ? '+' : '';

                        const span = `
                                <span class="mr-8 font-medium">
                                    ${item.original_name}: 
                                    <span class="${colorClass}">${symbol}${lp}%</span>
                                </span>
                            `;
                        tickerEl.append(span);
                    });
                } else {
                    console.error(result.message || 'API error');
                }
            },
            error: function (xhr, status, error) {
                console.error("AJAX error:", error);
            }
        });
    }
});


