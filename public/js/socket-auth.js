/**
 * Jagatud autentimismoodul töötajate liideste jaoks.
 * Kutsu initAuth(liidesNimi, onSuccess) autentimisvormi kuvamiseks.
 * Eduka autentimise korral kutsutakse onSuccess(socket) ühendatud socketiga.
 */
function initAuth(interfaceName, onSuccess) {
  const overlay = document.getElementById('auth-overlay');
  const keyInput = document.getElementById('auth-key');
  const submitBtn = document.getElementById('auth-submit');
  const errorMsg = document.getElementById('auth-error');

  // Loo Socket.IO ühendus
  const socket = io({ autoConnect: true });

  // Autentimiskatse funktsioon
  function attemptAuth() {
    const key = keyInput.value.trim();
    if (!key) {
      errorMsg.textContent = 'Palun sisesta pääsuvõti.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Kontrollin...';
    errorMsg.textContent = '';

    // Saada pääsuvõti serverile kontrollimiseks
    socket.emit('authenticate', { interface: interfaceName, key });
  }

  // Edukas autentimine — peida overlay ja anna kontroll edasi
  socket.on('auth-success', () => {
    overlay.style.display = 'none';
    onSuccess(socket);
  });

  // Ebaõnnestunud autentimine — kuva veateade ja tühjenda väli
  socket.on('auth-failure', ({ message }) => {
    errorMsg.textContent = message;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sisene';
    keyInput.value = '';
    keyInput.focus();
  });

  // Nupuvajutuse ja Enter-klahvi kuulajad
  submitBtn.addEventListener('click', attemptAuth);
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptAuth();
  });

  keyInput.focus();
}
