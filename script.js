document.addEventListener('DOMContentLoaded', () => {

    // URL base de nuestra API. 
    // Funciona tanto en local como en producción (Render) gracias a la ruta relativa.
    const API_URL = '/api';


    // Detectamos en qué página estamos actualmente para ejecutar solo el código necesario.
    const path = window.location.pathname;
    const isLogin = path.includes('index.html') || path === '/' || path.endsWith('/');
    const isRegister = path.includes('registro.html');
    const isIndex = path.includes('inicio.html');


    // --- GESTIÓN DE SESIÓN ---
    // Guardamos la información del usuario en localStorage.
    // Así evitamos que tenga que loguearse cada vez que recarga la página.
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


    // --- SISTEMA DE NOTIFICACIONES INTERNAS (TOASTS) ---
    function showInAppNotification(title, body, type = 'general') {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        toast.innerHTML = `
            <div class="toast-header">
                <span>${title}</span>
                <span style="font-size: 10px; opacity: 0.5;">ahora</span>
            </div>
            <div class="toast-body">${body}</div>
        `;

        // Efecto al hacer click: cerrar la notificación
        toast.addEventListener('click', () => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        });

        container.appendChild(toast);

        // Auto-eliminar después de 5 segundos
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('removing');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }


    // Dependiendo de en qué página estemos, ejecutamos lógica diferente
    // --- LÓGICA DE REGISTRO ---
    if (isRegister) {
        console.log('Estamos en la página de registro.');
        const form = document.getElementById('registro-form');

        // Escuchamos el envío del formulario de registro
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); // Evitamos que la página se recargue

            // Obtenemos los valores de los inputs
            const username = document.getElementById('reg-usuario').value.trim();
            const password = document.getElementById('reg-password').value;
            const confirmPassword = document.getElementById('reg-confirm-password').value;

            // Verificamos que las contraseñas coincidan antes de enviar nada al servidor
            if (password !== confirmPassword) {
                alert('Las contraseñas no coinciden, por favor verifícalas.');
                return;
            }

            try {
                // Enviamos los datos al backend para crear el usuario
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    alert('¡Usuario registrado con éxito! Ahora puedes iniciar sesión.');
                    window.location.href = 'index.html'; // Redirigimos al login
                } else {
                    alert(data.message || 'Hubo un problema al registrar el usuario.');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('No se pudo conectar con el servidor. Verifica que "node server.js" esté ejecutándose.');
            }
        });
    }


    // --- LÓGICA DE LOGIN ---
    if (isLogin) {
        console.log('Estamos en la página de login.');
        const form = document.getElementById('login-form');

        // Escuchamos el envío del formulario de login
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-usuario').value.trim();
            const password = document.getElementById('login-password').value;

            try {
                // Enviamos credenciales al backend para verificar
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    // Si el login es correcto, guardamos la sesión y vamos al inicio
                    setSession(data.user);
                    window.location.href = 'inicio.html';
                } else {
                    alert(data.message || 'Usuario o contraseña incorrectos.');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error de conexión. Asegúrate de que el servidor esté encendido.');
            }
        });
    }


    // --- LÓGICA PRINCIPAL (DASHBOARD / INICIO) ---
    if (isIndex) {
        // Verificamos si hay un usuario logueado
        const currentUser = getSession();


        // Si no hay sesión, lo mandamos de vuelta al login
        if (!currentUser) {
            window.location.href = 'index.html';
            return;
        }

        console.log('Sesión iniciada correctamente como:', currentUser.username);

        // Mostramos el nombre del usuario en la interfaz
        document.getElementById('current-user').textContent = `Hola, ${currentUser.username}`;

        // ACTUALIZACIÓN DE UI SI ES ADMIN
        if (currentUser.username.includes('.admin')) {
            document.getElementById('current-user').style.color = '#e74c3c'; // Rojo para admin
            document.getElementById('current-user').innerHTML += ' (Admin)';
        }


        // Botón de cerrar sesión
        document.getElementById('btn-logout').addEventListener('click', () => {
            clearSession();
            window.location.href = 'index.html';
        });

        // Variables para gestionar el estado de los mensajes y filtros
        let currentFilter = 'todos';
        let activeChat = null;
        // activeChat estructura:
        // null -> Global (Público)
        // { type: 'private', user: 'username' } -> Privado
        // { type: 'group', id: 'groupId', name: 'GroupName' } -> Grupo

        let allMessages = [];
        let lastMessageCount = 0; // Para detectar nuevos mensajes
        let lastGroupCount = 0;   // Para detectar nuevos grupos
        const userList = document.getElementById('lista-usuarios');
        const groupList = document.getElementById('lista-grupos'); // Nuevo
        const areaMensajes = document.getElementById('area-mensajes');
        const chatSubtitulo = document.getElementById('chat-subtitulo'); // Nuevo
        const inputMensaje = document.getElementById('input-mensaje');
        const btnEnviar = document.getElementById('btn-enviar');


        // --- CAMBIO DE CHAT ---
        function setActiveChat(chat) {
            activeChat = chat;
            activeChatChanged();
        }

        function activeChatChanged() {
            // 1. Actualizar título
            if (!activeChat) {
                chatSubtitulo.textContent = "Canal General (Público)";
                // Restricción de Admin en Global
                if (!currentUser.username.includes('.admin')) {
                    inputMensaje.disabled = true;
                    inputMensaje.placeholder = "Solo administradores pueden enviar mensajes aquí.";
                    btnEnviar.disabled = true;
                } else {
                    inputMensaje.disabled = false;
                    inputMensaje.placeholder = "Escribe un mensaje público...";
                    btnEnviar.disabled = false;
                }
            } else if (activeChat.type === 'private') {
                chatSubtitulo.textContent = `Chat Privado con ${activeChat.user}`;
                inputMensaje.disabled = false;
                inputMensaje.placeholder = `Mensaje para ${activeChat.user}...`;
                btnEnviar.disabled = false;
            } else if (activeChat.type === 'group') {
                chatSubtitulo.textContent = `Grupo: ${activeChat.name}`;
                inputMensaje.disabled = false;
                inputMensaje.placeholder = `Mensaje para el grupo...`;
                btnEnviar.disabled = false;
            }

            // 2. Recargar mensajes del nuevo chat
            loadMessages();

            // 3. Resaltar selección en listas (Visual)
            document.querySelectorAll('.usuario-item, .grupo-item').forEach(el => el.classList.remove('selected'));
            // (La lógica de añadir clase .selected se puede mejorar, por ahora basta con recargar)
        }

        // Inicializamos UI
        activeChatChanged();

        // Title click -> Volver a General
        document.getElementById('app-title').addEventListener('click', () => setActiveChat(null));


        // --- CARGA DE USUARIOS ---
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
                        if (activeChat && activeChat.type === 'private' && activeChat.user === user.username) {
                            li.classList.add('selected');
                        }

                        li.innerHTML = `
                            <div class="avatar">${user.username[0].toUpperCase()}</div>
                            <span>${user.username}</span>
                        `;

                        // Click para ir a privado
                        li.addEventListener('click', () => {
                            setActiveChat({ type: 'private', user: user.username });
                            if (window.innerWidth <= 768) toggleLeftPanel();
                        });

                        userList.appendChild(li);
                    }
                });
            } catch (error) {
                console.error('Error usuarios:', error);
            }
        }

        // --- CARGA DE GRUPOS ---
        async function loadGroups() {
            try {
                const response = await fetch(`${API_URL}/groups?username=${currentUser.username}`);
                if (!response.ok) return;

                const groups = await response.json();

                // --- DETECCIÓN DE NUEVOS GRUPOS PARA NOTIFICACIONES ---
                if (groups.length > lastGroupCount && lastGroupCount > 0) {
                    const newGroups = groups.slice(lastGroupCount);
                    newGroups.forEach(group => {
                        showNotification(
                            '👥 Nuevo Grupo Creado',
                            `Has sido añadido al grupo "${group.name}"`
                        );
                    });
                }
                lastGroupCount = groups.length;

                groupList.innerHTML = '';

                groups.forEach(group => {
                    const li = document.createElement('li');
                    li.className = 'grupo-item usuario-item'; // Reusamos estilos
                    if (activeChat && activeChat.type === 'group' && activeChat.id === group._id) {
                        li.classList.add('selected');
                    }

                    li.innerHTML = `
                        <div class="avatar" style="background-color: #e67e22;">G</div>
                        <span>${group.name}</span>
                    `;

                    li.addEventListener('click', () => {
                        setActiveChat({ type: 'group', id: group._id, name: group.name });
                        if (window.innerWidth <= 768) toggleLeftPanel();
                    });

                    groupList.appendChild(li);
                });
            } catch (error) {
                console.error('Error grupos:', error);
            }
        }

        loadUsers();
        loadGroups();


        // --- CREACIÓN DE GRUPOS (MODAL) ---
        const modalGrupo = document.getElementById('modal-grupo');
        const btnCrearGrupo = document.getElementById('btn-crear-grupo');
        const btnCancelarGrupo = document.getElementById('btn-cancelar-grupo');
        const btnConfirmarGrupo = document.getElementById('btn-confirmar-grupo');
        const listaSeleccion = document.getElementById('lista-seleccion-usuarios');

        btnCrearGrupo.addEventListener('click', async () => {
            // Cargar usuarios para seleccionar
            const response = await fetch(`${API_URL}/users`);
            const users = await response.json();
            listaSeleccion.innerHTML = '';

            users.forEach(u => {
                if (u.username === currentUser.username) return; // No mostramos al propio usuario
                const div = document.createElement('div');
                div.innerHTML = `
                    <label style="display:flex; align-items:center; gap: 10px; padding: 5px;">
                        <input type="checkbox" value="${u.username}" class="chk-user">
                        <span>${u.username}</span>
                    </label>
                 `;
                listaSeleccion.appendChild(div);
            });

            modalGrupo.classList.remove('hidden');
        });

        btnCancelarGrupo.addEventListener('click', () => {
            modalGrupo.classList.add('hidden');
        });

        btnConfirmarGrupo.addEventListener('click', async () => {
            const name = document.getElementById('input-nombre-grupo').value.trim();
            if (!name) return alert('Ponle un nombre al grupo');

            const selectedUsers = Array.from(document.querySelectorAll('.chk-user:checked')).map(cb => cb.value);
            if (selectedUsers.length === 0) return alert('Selecciona al menos un miembro');

            try {
                const res = await fetch(`${API_URL}/groups`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        creator: currentUser.username,
                        members: selectedUsers
                    })
                });

                if (res.ok) {
                    modalGrupo.classList.add('hidden');
                    loadGroups(); // Recargar lista
                    alert('Grupo creado!');
                } else {
                    alert('Error al crear grupo');
                }
            } catch (e) {
                console.error(e);
            }
        });


        // Manejo del botón "Redactar"
        const btnRedactar = document.getElementById('btn-redactar');
        const seccionRedactar = document.getElementById('seccion-redactar');

        btnRedactar.addEventListener('click', () => {
            // Mostramos u ocultamos el área de redacción
            seccionRedactar.classList.toggle('hidden');

            // Si estamos en móvil, cerramos el menú lateral para ver mejor
            if (window.innerWidth <= 768) {
                toggleRightPanel();
            }
        });


        // Manejo del envío de mensajes
        const btnBorrador = document.getElementById('btn-borrador');

        // Menú contextual (click derecho o botón de opciones)
        const contextMenu = document.getElementById('context-menu');
        let selectedMessageId = null;


        // Ocultamos el menú contextual si hacemos click en cualquier otro lado
        document.addEventListener('click', () => contextMenu.classList.add('hidden'));


        // Función genérica para guardar un mensaje (ya sea enviado o borrador)
        async function saveMessage(text, status) {
            if (!text) return; // No enviamos mensajes vacíos

            const messageData = {
                sender: currentUser.username,
                senderId: currentUser._id,
                text: text,
                status: status
            };

            // Añadimos contexto (privado o grupo)
            if (activeChat) {
                if (activeChat.type === 'private') {
                    messageData.recipient = activeChat.user;
                } else if (activeChat.type === 'group') {
                    messageData.groupId = activeChat.id;
                }
            }

            try {
                const response = await fetch(`${API_URL}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(messageData)
                });

                const json = await response.json();

                if (response.ok) {
                    inputMensaje.value = ''; // Limpiamos el campo de texto
                    loadMessages(); // Recargamos la lista de mensajes

                    // Notificación (Simulada para el remitente, pero real si fuéramos otro)
                    if (Notification.permission === "granted") {
                        // new Notification("Mensaje enviado");
                    }
                } else {
                    alert('Error: ' + (json.message || 'No se pudo enviar el mensaje'));
                }
            } catch (error) {
                console.error('Error al guardar mensaje:', error);
            }
        }

        // Asignamos eventos a los botones de enviar y guardar borrador
        btnEnviar.addEventListener('click', () => saveMessage(inputMensaje.value.trim(), 'sent'));
        btnBorrador.addEventListener('click', () => saveMessage(inputMensaje.value.trim(), 'draft'));


        // --- VIGILANCIA GLOBAL DE NOTIFICACIONES ---
        async function checkGlobalNotifications() {
            try {
                // Pedimos todos los mensajes relevantes para el usuario
                const response = await fetch(`${API_URL}/messages/all?username=${currentUser.username}`);
                if (!response.ok) return;

                const messages = await response.json();

                // Detectamos nuevos mensajes comparando con el conteo anterior
                if (messages.length > lastMessageCount && lastMessageCount > 0) {
                    const newMessages = messages.slice(lastMessageCount);

                    newMessages.forEach(msg => {
                        // Solo notificamos si el mensaje NO es nuestro y es un mensaje enviado ('sent')
                        if (msg.sender !== currentUser.username && msg.status === 'sent') {
                            let notifTitle = '';
                            let notifBody = '';
                            let type = 'general';
                            if (!msg.recipient && !msg.groupId) {
                                // Chat General
                                notifTitle = '📢 Nuevo en General';
                                notifBody = `${msg.sender}: ${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}`;
                                type = 'general';
                            } else if (msg.recipient === currentUser.username) {
                                // Mensaje Privado para mí
                                notifTitle = `💬 Privado de ${msg.sender}`;
                                notifBody = msg.text.substring(0, 50) + (msg.text.length > 50 ? '...' : '');
                                type = 'private';
                            } else if (msg.groupId) {
                                // Mensaje en un grupo
                                notifTitle = `👥 Grupo: ${msg.sender}`;
                                notifBody = `${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}`;
                                type = 'group';
                            }

                            if (notifTitle) {
                                showInAppNotification(notifTitle, notifBody, type);
                            }
                        }
                    });
                }
                lastMessageCount = messages.length;
            } catch (error) {
                console.error('Error en polling global:', error);
            }
        }

        // Función para cargar los mensajes desde el servidor
        async function loadMessages() {
            try {
                let url = `${API_URL}/messages`;

                // Construimos la URL según el chat activo
                if (!activeChat) {
                    // Global -> Sin params (o explícitos si quisiéramos)
                } else if (activeChat.type === 'private') {
                    url += `?username=${currentUser.username}&recipient=${activeChat.user}`;
                } else if (activeChat.type === 'group') {
                    url += `?groupId=${activeChat.id}`;
                }

                const response = await fetch(url);
                if (!response.ok) return;

                const messages = await response.json();

                allMessages = messages; // Guardamos todos los mensajes en memoria
                renderMessages(messages); // Y luego los pintamos en pantalla
            } catch (error) {
                console.error('Error al cargar mensajes:', error);
            }
        }

        // Función principal de renderizado (dibujado) de mensajes
        // Aquí aplicamos los filtros seleccionados (todos, enviados, papelera, etc.)
        function renderMessages(messages) {
            areaMensajes.innerHTML = ''; // Limpiamos el área de mensajes

            // Filtramos los mensajes según el criterio actual
            let filteredMessages = messages.filter(msg => {
                // Verificamos si el mensaje fue eliminado por el usuario actual
                const isDeleted = msg.deletedFor && msg.deletedFor.includes(currentUser.username);

                if (currentFilter === 'papelera') {
                    // En la papelera solo mostramos lo eliminado
                    return isDeleted;
                }

                if (isDeleted) return false; // Si está eliminado y no estamos en papelera, no lo mostramos

                // Lógica de filtrado según la pestaña activa
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

            // Si no hay mensajes que mostrar, ponemos un aviso
            if (filteredMessages.length === 0) {
                areaMensajes.innerHTML = '<div class="empty-message-container">No hay mensajes aquí.</div>';
                return;
            }

            // Recorremos los mensajes filtrados y creamos sus elementos HTML
            filteredMessages.forEach(msg => {
                const div = document.createElement('div');
                // Asignamos clases según si el mensaje es nuestro o recibido
                div.className = `mensaje ${msg.sender === currentUser.username ? 'propio' : 'recibido'}`;

                if (msg.starred) div.classList.add('starred');
                if (msg.status === 'deleted_everyone') div.classList.add('deleted');

                // Si no es nuestro, mostramos quién lo envió
                let senderInfo = '';
                if (msg.sender !== currentUser.username) {
                    senderInfo = `<div class="sender-info">${msg.sender}</div>`;
                }

                // Si fue eliminado para todos, mostramos un texto especial
                const displayText = msg.status === 'deleted_everyone' ? '🚫 <i>Este mensaje ha sido eliminado</i>' : msg.text;
                const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                div.innerHTML = `
                    ${senderInfo}
                    ${displayText}
                    <button class="message-options-btn">⋮</button>
                    <div class="message-timestamp">${time}</div>
                `;


                // Configuración del botón de opciones (tres puntitos) del mensaje
                const btnOptions = div.querySelector('.message-options-btn');
                btnOptions.addEventListener('click', (e) => {
                    e.stopPropagation(); // Evitamos que el click se propague
                    if (msg.status === 'deleted_everyone') return; // Si está eliminado, no mostramos opciones

                    selectedMessageId = msg._id; // Guardamos qué mensaje se seleccionó

                    // Calculamos dónde mostrar el menú contextual flotante
                    const rect = div.getBoundingClientRect();
                    contextMenu.style.top = `${rect.bottom + 5}px`;

                    let menuLeft = rect.left;
                    if (div.classList.contains('propio')) {
                        menuLeft = rect.right - 180; // Ajustamos si el mensaje es nuestro (derecha)
                    }

                    // Ajustes para que el menú no se salga de la pantalla en móviles
                    if (menuLeft + 180 > window.innerWidth) {
                        menuLeft = window.innerWidth - 190;
                    }
                    if (menuLeft < 10) {
                        menuLeft = 10;
                    }

                    contextMenu.style.left = `${menuLeft}px`;
                    contextMenu.classList.remove('hidden');

                    // Cambiamos el texto del botón destacar según estado actual
                    document.getElementById('ctx-destacar').textContent = msg.starred ? '★ Quitar destacado' : '★ Destacar';
                });

                areaMensajes.appendChild(div);
            });
            // Hacemos scroll al final para ver los últimos mensajes
            areaMensajes.scrollTop = areaMensajes.scrollHeight;
        }

        loadMessages();


        // Función para enviar actualizaciones de un mensaje al servidor (editar, borrar, destacar)
        async function updateMessage(id, updates) {
            try {
                await fetch(`${API_URL}/messages/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });
                loadMessages(); // Refrescamos la vista
            } catch (error) {
                console.error('Error al actualizar:', error);
            }
        }


        // Eventos de las opciones del menú contextual
        document.getElementById('ctx-destacar').addEventListener('click', () => {
            const msg = allMessages.find(m => m._id === selectedMessageId);
            if (msg) updateMessage(selectedMessageId, { starred: !msg.starred });
        });

        document.getElementById('ctx-borrar-mi').addEventListener('click', () => {
            // Borrado lógico solo para el usuario actual
            updateMessage(selectedMessageId, { deletedForUser: currentUser.username });
        });

        document.getElementById('ctx-borrar-todos').addEventListener('click', () => {
            // Borrado para todos (cambia el estado del mensaje)
            updateMessage(selectedMessageId, { status: 'deleted_everyone' });
        });


        // Gestión de los filtros de la barra lateral
        const filters = ['todos', 'enviados', 'borradores', 'destacados', 'papelera'];
        filters.forEach(filter => {
            document.getElementById(`filter-${filter}`).addEventListener('click', (e) => {
                currentFilter = filter;

                // Actualizamos visualmente qué botón está activo
                document.querySelectorAll('.botones').forEach(b => b.classList.remove('activo'));
                e.target.classList.add('activo');

                renderMessages(allMessages); // Usamos allMessages que ya tenemos en memoria (Cuidado: esto no recarga del server)

                // En móvil cerramos el panel después de elegir filtro
                if (window.innerWidth <= 768) {
                    toggleRightPanel();
                }
            });
        });

        // --- RESPONSIVE / MÓVIL ---
        // Lógica para abrir/cerrar menús laterales en pantallas pequeñas
        const btnToggleUsers = document.getElementById('btn-toggle-users');
        const btnToggleMenu = document.getElementById('btn-toggle-menu');
        const panelIzquierdo = document.querySelector('.panel-izquierdo');
        const panelDerecho = document.querySelector('.panel-derecho');

        // Creamos una capa oscura (overlay) para cuando se abre un menú
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        document.body.appendChild(overlay);

        function toggleLeftPanel() {
            panelIzquierdo.classList.toggle('active');
            overlay.classList.toggle('active');
            // Si abrimos uno, cerramos el otro
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

        // Asignamos los eventos a los botones de menú hamburguesa
        if (btnToggleUsers) btnToggleUsers.addEventListener('click', toggleLeftPanel);
        const appTitle = document.getElementById('app-title');
        if (appTitle) appTitle.addEventListener('click', toggleLeftPanel); // Clic en título también abre usuarios
        if (btnToggleMenu) btnToggleMenu.addEventListener('click', toggleRightPanel);
        overlay.addEventListener('click', closeAllPanels); // Clic fuera cierra todo





        // Polling: Actualizamos mensajes y usuarios automáticamente cada 3 segundos
        // Solo si no estamos escribiendo para no molestar
        setInterval(() => {
            if (document.activeElement !== inputMensaje) {
                loadMessages();
                loadUsers();
                loadGroups();
                checkGlobalNotifications(); // Vigilancia global de mensajes
            }
        }, 3000);
    }
});