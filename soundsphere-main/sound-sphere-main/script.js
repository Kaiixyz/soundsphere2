function signIn(event) {
    event.preventDefault();
    

    const isAuthenticated = true; 
    if (isAuthenticated) {
        setTimeout(() => {
            window.location.href = 'home.html';
        }, 100);
    }
}

function signIn(event) {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // Get registered users
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    // Find matching user
    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', email);
        localStorage.setItem('username', user.username);
        // small delay before redirect
        setTimeout(() => {
            window.location.href = 'home.html';
        }, 100);
    } else {
        alert('Invalid credentials');
    }
}