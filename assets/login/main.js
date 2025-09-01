// Dark Mode Toggle
// const darkModeToggle = document.getElementById('darkModeToggle');
const html = document.documentElement;

// Check for saved user preference or use system preference
if (localStorage.getItem('darkMode') === 'true' ||
    (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    html.classList.add('dark');
}

// darkModeToggle.addEventListener('click', () => {
//     html.classList.toggle('dark');
//     localStorage.setItem('darkMode', html.classList.contains('dark'));
// });

// Form Toggle
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const tabIndicator = document.getElementById('tabIndicator');
const toggleForms = document.querySelectorAll('.toggle-form');

function showLogin() {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginTab.classList.add('text-primary-600', 'dark:text-primary-400');
    loginTab.classList.remove('text-gray-500', 'dark:text-gray-400');
    registerTab.classList.add('text-gray-500', 'dark:text-gray-400');
    registerTab.classList.remove('text-primary-600', 'dark:text-primary-400');
    tabIndicator.style.transform = 'translateX(0)';
}

function showRegister() {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    registerTab.classList.add('text-primary-600', 'dark:text-primary-400');
    registerTab.classList.remove('text-gray-500', 'dark:text-gray-400');
    loginTab.classList.add('text-gray-500', 'dark:text-gray-400');
    loginTab.classList.remove('text-primary-600', 'dark:text-primary-400');
    tabIndicator.style.transform = 'translateX(100%)';
}

loginTab.addEventListener('click', showLogin);
registerTab.addEventListener('click', showRegister);

toggleForms.forEach(toggle => {
    toggle.addEventListener('click', () => {
        if (toggle.dataset.target === 'login') {
            showLogin();
        } else {
            showRegister();
        }
    });
});

// Password Visibility Toggle
function setupPasswordToggle(inputId, toggleId) {
    const passwordInput = document.getElementById(inputId);
    const toggleIcon = document.getElementById(toggleId);

    toggleIcon.addEventListener('click', () => {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.classList.replace('fa-eye-slash', 'fa-eye');
        } else {
            passwordInput.type = 'password';
            toggleIcon.classList.replace('fa-eye', 'fa-eye-slash');
        }
    });
}

setupPasswordToggle('loginPassword', 'toggleLoginPassword');
setupPasswordToggle('registerPassword', 'toggleRegisterPassword');
setupPasswordToggle('registerConfirmPassword', 'toggleRegisterConfirmPassword');

// Toast Notification System - Updated for top sliding
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

// Input Validation
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showError(input, errorElement, message) {
    input.classList.add('input-error');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    return false;
}

function clearError(input, errorElement) {
    input.classList.remove('input-error');
    errorElement.style.display = 'none';
    return true;
}

// Form Validation
function validateLoginForm() {
    let isValid = true;
    const email = document.getElementById('loginEmail');
    const password = document.getElementById('loginPassword');
    const emailError = document.getElementById('loginEmailError');
    const passwordError = document.getElementById('loginPasswordError');

    // Validate email
    if (!email.value.trim()) {
        isValid = showError(email, emailError, 'Email is required');
    } else if (!validateEmail(email.value.trim())) {
        isValid = showError(email, emailError, 'Please enter a valid email');
    } else {
        clearError(email, emailError);
    }

    // Validate password
    if (!password.value.trim()) {
        isValid = showError(password, passwordError, 'Password is required');
    } else if (password.value.trim().length < 6) {
        isValid = showError(password, passwordError, 'Password must be at least 6 characters');
    } else {
        clearError(password, passwordError);
    }

    return isValid;
}

function validateRegisterForm() {
    let isValid = true;
    const name = document.getElementById('registerName');
    const email = document.getElementById('registerEmail');
    const password = document.getElementById('registerPassword');
    const confirmPassword = document.getElementById('registerConfirmPassword');
    const terms = document.getElementById('acceptTerms');

    const nameError = document.getElementById('registerNameError');
    const emailError = document.getElementById('registerEmailError');
    const passwordError = document.getElementById('registerPasswordError');
    const confirmPasswordError = document.getElementById('registerConfirmPasswordError');
    const termsError = document.getElementById('acceptTermsError');

    // Validate name
    if (!name.value.trim()) {
        isValid = showError(name, nameError, 'Name is required');
    } else if (name.value.trim().length < 3) {
        isValid = showError(name, nameError, 'Name must be at least 3 characters');
    } else {
        clearError(name, nameError);
    }

    // Validate email
    if (!email.value.trim()) {
        isValid = showError(email, emailError, 'Email is required');
    } else if (!validateEmail(email.value.trim())) {
        isValid = showError(email, emailError, 'Please enter a valid email');
    } else {
        clearError(email, emailError);
    }

    // Validate password
    if (!password.value.trim()) {
        isValid = showError(password, passwordError, 'Password is required');
    } else if (password.value.trim().length < 6) {
        isValid = showError(password, passwordError, 'Password must be at least 6 characters');
    } else {
        clearError(password, passwordError);
    }

    // Validate confirm password
    if (!confirmPassword.value.trim()) {
        isValid = showError(confirmPassword, confirmPasswordError, 'Please confirm your password');
    } else if (password.value !== confirmPassword.value) {
        isValid = showError(confirmPassword, confirmPasswordError, 'Passwords do not match');
    } else {
        clearError(confirmPassword, confirmPasswordError);
    }

    // Validate terms
    if (!terms.checked) {
        termsError.style.display = 'block';
        isValid = false;
    } else {
        termsError.style.display = 'none';
    }

    return isValid;
}

// Form Submission (with validation)
document.getElementById('loginFormElement').addEventListener('submit', (e) => {
    e.preventDefault();

    if (!validateLoginForm()) {
        createToast('error', 'Validation Error', 'Please fix the errors in the form');
        return;
    }

    // Create ripple effect
    const button = e.target.querySelector('button[type="submit"]');
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');

    // Get click position
    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Position ripple
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    button.appendChild(ripple);

    // Remove ripple after animation
    setTimeout(() => {
        ripple.remove();
    }, 600);

    // Simulate API call
    setTimeout(() => {
        createToast('success', 'Login Successful', 'Welcome back! Redirecting to dashboard...');

        // Reset form
        e.target.reset();
    }, 800);
});

document.getElementById('registerFormElement').addEventListener('submit', (e) => {
    e.preventDefault();

    if (!validateRegisterForm()) {
        createToast('error', 'Validation Error', 'Please fix the errors in the form');
        return;
    }

    // Create ripple effect
    const button = e.target.querySelector('button[type="submit"]');
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');

    // Get click position
    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Position ripple
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    button.appendChild(ripple);

    // Remove ripple after animation
    setTimeout(() => {
        ripple.remove();
    }, 600);

    // Simulate API call
    setTimeout(() => {
        createToast('success', 'Registration Successful', 'Account created successfully! Please check your email for verification.');

        // Reset form
        e.target.reset();

        // Switch to login form after a delay
        setTimeout(() => {
            showLogin();
        }, 2000);
    }, 800);
});


// Real-time validation for inputs
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
        if (input.id === 'loginEmail') {
            if (input.value.trim() && !validateEmail(input.value.trim())) {
                showError(input, document.getElementById('loginEmailError'), 'Please enter a valid email');
            } else {
                clearError(input, document.getElementById('loginEmailError'));
            }
        }

        if (input.id === 'loginPassword') {
            if (input.value.trim() && input.value.trim().length < 6) {
                showError(input, document.getElementById('loginPasswordError'), 'Password must be at least 6 characters');
            } else {
                clearError(input, document.getElementById('loginPasswordError'));
            }
        }

        if (input.id === 'registerName') {
            if (input.value.trim() && input.value.trim().length < 3) {
                showError(input, document.getElementById('registerNameError'), 'Name must be at least 3 characters');
            } else {
                clearError(input, document.getElementById('registerNameError'));
            }
        }

        if (input.id === 'registerEmail') {
            if (input.value.trim() && !validateEmail(input.value.trim())) {
                showError(input, document.getElementById('registerEmailError'), 'Please enter a valid email');
            } else {
                clearError(input, document.getElementById('registerEmailError'));
            }
        }

        if (input.id === 'registerPassword') {
            const password = input.value.trim();

            const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?#&])[A-Za-z\d@$!%*?#&]{8,}$/;

            if (!strongPasswordPattern.test(password)) {
                showError(input, document.getElementById('registerPasswordError'),
                    'Password must be at least 8 characters, include upper & lower case letters, a number, and a special character.');
            } else {
                clearError(input, document.getElementById('registerPasswordError'));
            }
        }


        if (input.id === 'registerConfirmPassword') {
            const password = document.getElementById('registerPassword').value;
            if (input.value.trim() && input.value !== password) {
                showError(input, document.getElementById('registerConfirmPasswordError'), 'Passwords do not match');
            } else {
                clearError(input, document.getElementById('registerConfirmPasswordError'));
            }
        }
    });
});

function signup(postUrl) {
    var isValid = true;
    var alertText = "";

    let email = $('#registerEmail').val().trim();
    let password = $('#registerPassword').val().trim();
    let confirm_password = $('#registerConfirmPassword').val().trim();
    let acceptTerms = $('#acceptTerms').is(':checked');

    // Check required fields
    $('.regReq').each(function () {
        const val = $(this).val().trim();
        if (!val) {
            isValid = false;
            alertText = $(this).closest('.input-group').find('label').text();
            return false;
        }
    });

    if (!isValid) {
        createToast('error', 'Validation', `${alertText} is required!`);
        return false;
    }

    // Validate email format
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        createToast('error', 'Validation', `Please enter a valid email address!`);
        return false;
    }

    // Validate strong password
    // At least 8 characters, one uppercase, one lowercase, one digit, one special character
    const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?#&])[A-Za-z\d@$!%*?#&]{8,}$/;
    if (!strongPasswordPattern.test(password)) {
        createToast('error', 'Validation', `Please enter a strong password!`);
        return false;
    }

    // Confirm password match
    if (password !== confirm_password) {
        createToast('error', 'Validation', `Passwords do not match!`);
        return false;
    }

    // Validate Terms checkbox
    if (!acceptTerms) {
        createToast('error', 'Validation', `You must agree to the Terms and Privacy Policy.`);
        return false;
    }

    // Submit via AJAX
    $.ajax({
        url: postUrl,
        method: 'POST',
        data: $('#registerFormElement').serialize(),
        success: function (response) {
            if (response.success) {
                createToast('success', 'Registration Successful', 'Account created successfully! Please check your email for verification.');
                // Reset form
                document.querySelector('#registerFormElement').reset();
                // Switch to login form after a delay
                setTimeout(() => {
                    showLogin();
                }, 2000);
            } else {
                createToast('error', 'Registration failed', response.message || 'Signup failed!');
                if (response.paymentError == 1) {
                    window.location.replace(base_url + '#pricing')
                }
            }
        },

        error: function (xhr) {
            let res = xhr.responseJSON;
            if (res && res.message) {
                notyf.error(res.message);
                createToast('error', 'Registration failed', res.message);
            } else {
                createToast('error', 'Registration failed', 'Server error. Please try again later.');
            }
        }
    });

    return false; // Prevent default form submission
}

function signin(postUrl) {
    let isValid = true;
    let alertText = "";

    // Check required fields
    $('.logReq').each(function () {
        const val = $(this).val().trim();
        if (!val) {
            isValid = false;
            alertText = $(this).closest('.input-group').find('label').text();
            return false;
        }
    });

    if (!isValid) {
        createToast('error', 'Validation', `${alertText} is required!`);
        return false;
    }

    // Validate email format
    const email = $('#loginEmail').val().trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        createToast('error', 'Validation', `Please enter a valid email address!`);
        return false;
    }

    // Submit via AJAX
    $.ajax({
        url: postUrl,
        method: 'POST',
        data: $('#loginFormElement').serialize(),
        success: function (response) {
            if (response.success) {
                createToast('success', 'Login Successful', 'Redirecting to your dashboard...');
                // Reset form
                $('#loginFormElement')[0].reset();
                // Redirect to dashboard
                setTimeout(() => {
                    window.location.href = response.redirectTo;
                }, 1500);
            } else {
                // Show specific message if email is not verified
                if (response.code === 'EMAIL_NOT_VERIFIED') {
                    createToast('error', 'Email Not Verified', 'Please check your email inbox to verify your account.');
                } else {
                    createToast('error', 'Login Failed', response.message || 'Invalid email or password.');
                }
            }
        },
        error: function (xhr) {
            const res = xhr.responseJSON;
            createToast('error', 'Login Failed', res?.message || 'Server error. Please try again.');
        }
    });

    return false;
}