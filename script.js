document.addEventListener('DOMContentLoaded', () => {

    // URL base de nuestra API (funciona local y en Render gracias a la ruta relativa)
    const API_URL = '/api';


    const path = window.location.pathname;
    const isLogin = path.includes('index.html') || path === '/' || path.endsWith('/');
    const isRegister = path.includes('registro.html');
    const isIndex = path.includes('inicio.html');


    // --- GESTIÓN DE SESIÓN ---
    // Guardamos al usuario en localStorage para que no tenga que loguearse cada vez
    const SESSION_KEY = 'schoolconnect_session';

    function getSession() {
        return JSON.parse(localStorage.getItem(SESSION_KEY));
    }

    function setSession(user) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    }

    function clearSession() {
        localStorage.removeItem(SESSION_KEY);
    }


    // Dependiendo de en qué página estemos, ejecutamos lógica diferente
    // --- LÓGICA DE REGISTRO ---
    if (isRegister) {
        console.log('Modo Registro Activo');
        const form = document.getElementById('registro-form');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('reg-usuario').value.trim();
            const password = document.getElementById('reg-password').value;
            const confirmPassword = document.getElementById('reg-confirm-password').value;

            if (password !== confirmPassword) {
                alert('Las contraseñas no coinciden.');
                return;
            }

            try {
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    alert('Usuario registrado exitosamente.');
                    window.location.href = 'index.html';
                } else {
                    alert(data.message || 'Error al registrar usuario');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error de conexión con el servidor. Asegúrate de que "node server.js" esté corriendo.');
            }
        });
    }


    // --- LÓGICA DE LOGIN ---
    if (isLogin) {
        console.log('Modo Login Activo');
        const form = document.getElementById('login-form');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-usuario').value.trim();
            const password = document.getElementById('login-password').value;

            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    setSession(data.user);
                    window.location.href = 'inicio.html';
                } else {
                    alert(data.message || 'Error al iniciar sesión');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error de conexión con el servidor. Asegúrate de que "node server.js" esté corriendo.');
            }
        });
    }


    // --- LÓGICA PRINCIPAL (DASHBOARD) ---
    if (isIndex) {
        const currentUser = getSession();


        if (!currentUser) {
            window.location.href = 'index.html';
            return;
        }

        console.log('Sesión iniciada como:', currentUser.username);
        document.getElementById('current-user').textContent = `Hola, ${currentUser.username}`;


        document.getElementById('btn-logout').addEventListener('click', () => {
            clearSession();
            window.location.href = 'index.html';
        });

        let currentFilter = 'todos';
        let allMessages = [];
        const userList = document.getElementById('lista-usuarios');
        const areaMensajes = document.getElementById('area-mensajes');


        // Función para cargar la lista de usuarios desde el servidor
        async function loadUsers() {
            try {
                const response = await fetch(`${API_URL}/users`);
                if (!response.ok) return;

                const users = await response.json();
                userList.innerHTML = '';

                users.forEach(user => {
                    if (user.username !== currentUser.username) {
                        const li = document.createElement('li');
                        li.className = 'usuario-item';
                        li.innerHTML = `
                            <div class="avatar">${user.username[0].toUpperCase()}</div>
                            <span>${user.username}</span>
                        `;
                        userList.appendChild(li);
                    }
                });
            } catch (error) {
                console.error('Error al cargar usuarios:', error);
            }
        }
        loadUsers();


        const btnRedactar = document.getElementById('btn-redactar');
        const seccionRedactar = document.getElementById('seccion-redactar');

        btnRedactar.addEventListener('click', () => {
            seccionRedactar.classList.toggle('hidden');
            // Close menu on mobile to show the compose box
            if (window.innerWidth <= 768) {
                toggleRightPanel();
            }
        });


        const btnEnviar = document.getElementById('btn-enviar');
        const btnBorrador = document.getElementById('btn-borrador');
        const inputMensaje = document.getElementById('input-mensaje');
        const contextMenu = document.getElementById('context-menu');
        let selectedMessageId = null;


        document.addEventListener('click', () => contextMenu.classList.add('hidden'));


        // Función para guardar un mensaje (nuevo o borrador)
        async function saveMessage(text, status) {
            if (!text) return;

            try {
                const response = await fetch(`${API_URL}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sender: currentUser.username,
                        senderId: currentUser._id,
                        text: text,
                        status: status
                    })
                });

                if (response.ok) {
                    inputMensaje.value = '';
                    loadMessages();
                } else {
                    alert('Error al enviar mensaje');
                }
            } catch (error) {
                console.error('Error al guardar mensaje:', error);
            }
        }

        btnEnviar.addEventListener('click', () => saveMessage(inputMensaje.value.trim(), 'sent'));
        btnBorrador.addEventListener('click', () => saveMessage(inputMensaje.value.trim(), 'draft'));


        // Función para cargar y mostrar los mensajes
        async function loadMessages() {
            try {
                const response = await fetch(`${API_URL}/messages`);
                if (!response.ok) return;

                const messages = await response.json();
                allMessages = messages;
                renderMessages(messages);
            } catch (error) {
                console.error('Error al cargar mensajes:', error);
            }
        }

        // Renderizar (dibujar) los mensajes en pantalla aplicando filtros
        function renderMessages(messages) {
            areaMensajes.innerHTML = '';


            let filteredMessages = messages.filter(msg => {
                const isDeleted = msg.deletedFor && msg.deletedFor.includes(currentUser.username);

                if (currentFilter === 'papelera') {
                    return isDeleted;
                }

                if (isDeleted) return false;

                if (currentFilter === 'todos') {
                    return msg.status === 'sent';
                }
                if (currentFilter === 'enviados') {
                    return msg.sender === currentUser.username && msg.status === 'sent';
                }
                if (currentFilter === 'borradores') {
                    return msg.sender === currentUser.username && msg.status === 'draft';
                }
                if (currentFilter === 'destacados') {
                    return msg.starred === true && msg.status !== 'draft';
                }
                return false;
            });

            if (filteredMessages.length === 0) {
                areaMensajes.innerHTML = '<div class="empty-message-container">No hay mensajes.</div>';
                return;
            }

            filteredMessages.forEach(msg => {
                const div = document.createElement('div');
                div.className = `mensaje ${msg.sender === currentUser.username ? 'propio' : 'recibido'}`;
                if (msg.starred) div.classList.add('starred');
                if (msg.status === 'deleted_everyone') div.classList.add('deleted');

                let senderInfo = '';
                if (msg.sender !== currentUser.username) {
                    senderInfo = `<div class="sender-info">${msg.sender}</div>`;
                }

                const displayText = msg.status === 'deleted_everyone' ? '🚫 <i>Mensaje eliminado</i>' : msg.text;
                const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                div.innerHTML = `
                    ${senderInfo}
                    ${displayText}
                    <button class="message-options-btn">⋮</button>
                    <div class="message-timestamp">${time}</div>
                `;


                const btnOptions = div.querySelector('.message-options-btn');
                btnOptions.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (msg.status === 'deleted_everyone') return;

                    selectedMessageId = msg._id;

                    const rect = div.getBoundingClientRect();
                    contextMenu.style.top = `${rect.bottom + 5}px`;

                    // Responsive positioning for context menu
                    let menuLeft = rect.left;
                    if (div.classList.contains('propio')) {
                        menuLeft = rect.right - 180; // Adjust for menu width
                    }

                    // Prevent overflow on right edge
                    if (menuLeft + 180 > window.innerWidth) {
                        menuLeft = window.innerWidth - 190;
                    }
                    // Prevent overflow on left edge
                    if (menuLeft < 10) {
                        menuLeft = 10;
                    }

                    contextMenu.style.left = `${menuLeft}px`;

                    contextMenu.classList.remove('hidden');
                    document.getElementById('ctx-destacar').textContent = msg.starred ? '★ Quitar' : '★ Destacar';
                });

                areaMensajes.appendChild(div);
            });
            areaMensajes.scrollTop = areaMensajes.scrollHeight;
        }

        loadMessages();


        // Función para actualizar el estado de un mensaje (destacar, borrar)
        async function updateMessage(id, updates) {
            try {
                await fetch(`${API_URL}/messages/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });
                loadMessages();
            } catch (error) {
                console.error('Error al actualizar:', error);
            }
        }


        document.getElementById('ctx-destacar').addEventListener('click', () => {
            const msg = allMessages.find(m => m._id === selectedMessageId);
            if (msg) updateMessage(selectedMessageId, { starred: !msg.starred });
        });

        document.getElementById('ctx-borrar-mi').addEventListener('click', () => {
            updateMessage(selectedMessageId, { deletedForUser: currentUser.username });
        });

        document.getElementById('ctx-borrar-todos').addEventListener('click', () => {
            updateMessage(selectedMessageId, { status: 'deleted_everyone' });
        });


        const filters = ['todos', 'enviados', 'borradores', 'destacados', 'papelera'];
        filters.forEach(filter => {
            document.getElementById(`filter-${filter}`).addEventListener('click', (e) => {
                currentFilter = filter;
                document.querySelectorAll('.botones').forEach(b => b.classList.remove('activo'));
                e.target.classList.add('activo');

                renderMessages(allMessages);

                // Close menu on mobile after selection
                if (window.innerWidth <= 768) {
                    toggleRightPanel();
                }
            });
        });

        // --- RESPONSIVE / MÓVIL ---
        // Manejamos la apertura y cierre de paneles en pantallas pequeñas
        const btnToggleUsers = document.getElementById('btn-toggle-users');
        const btnToggleMenu = document.getElementById('btn-toggle-menu');
        const panelIzquierdo = document.querySelector('.panel-izquierdo');
        const panelDerecho = document.querySelector('.panel-derecho');

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        document.body.appendChild(overlay);

        function toggleLeftPanel() {
            panelIzquierdo.classList.toggle('active');
            overlay.classList.toggle('active');
            if (panelDerecho.classList.contains('active')) {
                panelDerecho.classList.remove('active');
            }
        }

        function toggleRightPanel() {
            panelDerecho.classList.toggle('active');
            overlay.classList.toggle('active');
            if (panelIzquierdo.classList.contains('active')) {
                panelIzquierdo.classList.remove('active');
            }
        }

        function closeAllPanels() {
            panelIzquierdo.classList.remove('active');
            panelDerecho.classList.remove('active');
            overlay.classList.remove('active');
        }

        if (btnToggleUsers) btnToggleUsers.addEventListener('click', toggleLeftPanel); // Keep for safety if cached html
        const appTitle = document.getElementById('app-title');
        if (appTitle) appTitle.addEventListener('click', toggleLeftPanel);
        if (btnToggleMenu) btnToggleMenu.addEventListener('click', toggleRightPanel);
        overlay.addEventListener('click', closeAllPanels);


        setInterval(() => {
            if (document.activeElement !== inputMensaje) {
                loadMessages();
                loadUsers();
            }
        }, 3000);
    }
});