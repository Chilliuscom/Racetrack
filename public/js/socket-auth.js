/**
 * Shared authentication module for admin interfaces.
 * Call initAuth(interfaceName, onSuccess) to show the auth prompt.
 * Once authenticated, onSuccess(socket) is called with the connected socket.
 */
function initAuth(interfaceName, onSuccess) {
  const overlay = document.getElementById('auth-overlay');
  const keyInput = document.getElementById('auth-key');
  const submitBtn = document.getElementById('auth-submit');
  const errorMsg = document.getElementById('auth-error');

  const socket = io({ autoConnect: true });

  function attemptAuth() {
    const key = keyInput.value.trim();
    if (!key) {
      errorMsg.textContent = 'Palun sisesta pääsuvõti.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Kontrollin...';
    errorMsg.textContent = '';

    socket.emit('authenticate', { interface: interfaceName, key });
  }

  socket.on('auth-success', () => {
    overlay.style.display = 'none';
    onSuccess(socket);
  });

  socket.on('auth-failure', ({ message }) => {
    errorMsg.textContent = message;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sisene';
    keyInput.value = '';
    keyInput.focus();
  });

  submitBtn.addEventListener('click', attemptAuth);
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptAuth();
  });

  keyInput.focus();
}
