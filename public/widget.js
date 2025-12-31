/**
 * Hotspot Widget - Comentarios visuales para cualquier sitio
 * Uso: <script src="https://tudominio.com/widget.js" data-project="ID"></script>
 */
(function() {
    'use strict';

    // Configuración desde el script tag
    const scriptTag = document.currentScript;
    const projectId = scriptTag?.getAttribute('data-project') || 'default';

    // Firebase config (mismo que ya tienes)
    const firebaseConfig = {
        apiKey: "AIzaSyCX3xBq_bXcQt_ERty_HpxoOOW8mFnMt9s",
        authDomain: "hotspot-62024.firebaseapp.com",
        projectId: "hotspot-62024",
        storageBucket: "hotspot-62024.firebasestorage.app",
        messagingSenderId: "106101169718",
        appId: "1:106101169718:web:695289ad0928f4aacf8297"
    };

    // Estado
    let state = {
        commentMode: false,
        comments: [],
        pendingComment: null
    };

    // Estilos del widget
    const styles = `
        .hotspot-fab {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 56px;
            height: 56px;
            background: #EF4444;
            border: none;
            border-radius: 50%;
            color: white;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(239,68,68,0.4);
            z-index: 999999;
            transition: transform 0.2s, background 0.2s;
        }
        .hotspot-fab:hover {
            transform: scale(1.1);
        }
        .hotspot-fab.active {
            background: #22C55E;
        }

        .hotspot-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 999998;
            cursor: crosshair;
            display: none;
        }
        .hotspot-overlay.active {
            display: block;
        }

        .hotspot-marker {
            position: absolute;
            width: 28px;
            height: 28px;
            background: #EF4444;
            border: 2px solid white;
            border-radius: 50%;
            color: white;
            font-size: 12px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transform: translate(-50%, -50%);
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            z-index: 999997;
            font-family: -apple-system, sans-serif;
        }
        .hotspot-marker:hover {
            transform: translate(-50%, -50%) scale(1.2);
        }

        .hotspot-popup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #18181B;
            border: 1px solid #27272A;
            border-radius: 12px;
            padding: 20px;
            width: 320px;
            z-index: 1000000;
            display: none;
            font-family: -apple-system, sans-serif;
        }
        .hotspot-popup.active {
            display: block;
        }
        .hotspot-popup h4 {
            color: #FAFAFA;
            margin: 0 0 12px 0;
            font-size: 16px;
        }
        .hotspot-popup textarea {
            width: 100%;
            height: 80px;
            background: #09090B;
            border: 1px solid #27272A;
            border-radius: 8px;
            padding: 10px;
            color: #FAFAFA;
            font-size: 14px;
            resize: none;
            margin-bottom: 12px;
        }
        .hotspot-popup textarea:focus {
            outline: none;
            border-color: #EF4444;
        }
        .hotspot-popup-buttons {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        .hotspot-btn {
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            border: none;
        }
        .hotspot-btn-cancel {
            background: #27272A;
            color: #FAFAFA;
        }
        .hotspot-btn-submit {
            background: #EF4444;
            color: white;
        }
        .hotspot-btn:hover {
            opacity: 0.9;
        }

        .hotspot-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 999999;
            display: none;
        }
        .hotspot-backdrop.active {
            display: block;
        }

        .hotspot-comment-view {
            position: fixed;
            background: #18181B;
            border: 1px solid #27272A;
            border-radius: 8px;
            padding: 12px;
            max-width: 280px;
            z-index: 1000000;
            font-family: -apple-system, sans-serif;
            display: none;
        }
        .hotspot-comment-view.active {
            display: block;
        }
        .hotspot-comment-view p {
            color: #FAFAFA;
            font-size: 13px;
            margin: 0 0 8px 0;
            line-height: 1.4;
        }
        .hotspot-comment-view small {
            color: #71717A;
            font-size: 11px;
        }
        .hotspot-comment-view button {
            margin-top: 8px;
            padding: 4px 8px;
            background: #22C55E;
            border: none;
            border-radius: 4px;
            color: white;
            font-size: 12px;
            cursor: pointer;
        }
    `;

    // Inyectar estilos
    function injectStyles() {
        const styleEl = document.createElement('style');
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    // Crear elementos del widget
    function createWidget() {
        // Botón flotante
        const fab = document.createElement('button');
        fab.className = 'hotspot-fab';
        fab.innerHTML = '+';
        fab.onclick = toggleCommentMode;
        document.body.appendChild(fab);

        // Overlay para capturar clicks
        const overlay = document.createElement('div');
        overlay.className = 'hotspot-overlay';
        overlay.onclick = handleOverlayClick;
        document.body.appendChild(overlay);

        // Popup para agregar comentario
        const popup = document.createElement('div');
        popup.className = 'hotspot-popup';
        popup.innerHTML = `
            <h4>Nuevo comentario</h4>
            <textarea id="hotspot-text" placeholder="Escribe tu comentario..."></textarea>
            <div class="hotspot-popup-buttons">
                <button class="hotspot-btn hotspot-btn-cancel" onclick="window.hotspotWidget.closePopup()">Cancelar</button>
                <button class="hotspot-btn hotspot-btn-submit" onclick="window.hotspotWidget.submitComment()">Enviar</button>
            </div>
        `;
        document.body.appendChild(popup);

        // Backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'hotspot-backdrop';
        backdrop.onclick = closePopup;
        document.body.appendChild(backdrop);

        // Vista de comentario
        const commentView = document.createElement('div');
        commentView.className = 'hotspot-comment-view';
        commentView.id = 'hotspot-comment-view';
        document.body.appendChild(commentView);
    }

    // Toggle modo comentarios
    function toggleCommentMode() {
        state.commentMode = !state.commentMode;
        const fab = document.querySelector('.hotspot-fab');
        const overlay = document.querySelector('.hotspot-overlay');

        if (state.commentMode) {
            fab.classList.add('active');
            fab.innerHTML = '✓';
            overlay.classList.add('active');
        } else {
            fab.classList.remove('active');
            fab.innerHTML = '+';
            overlay.classList.remove('active');
        }
    }

    // Manejar click en overlay
    function handleOverlayClick(e) {
        const x = e.pageX;
        const y = e.pageY;

        state.pendingComment = { x, y };

        // Mostrar popup
        document.querySelector('.hotspot-popup').classList.add('active');
        document.querySelector('.hotspot-backdrop').classList.add('active');
        document.getElementById('hotspot-text').value = '';
        document.getElementById('hotspot-text').focus();

        toggleCommentMode();
    }

    // Cerrar popup
    function closePopup() {
        document.querySelector('.hotspot-popup').classList.remove('active');
        document.querySelector('.hotspot-backdrop').classList.remove('active');
        state.pendingComment = null;
    }

    // Enviar comentario
    async function submitComment() {
        const text = document.getElementById('hotspot-text').value.trim();
        if (!text) return;

        const comment = {
            id: 'c_' + Date.now(),
            x: state.pendingComment.x,
            y: state.pendingComment.y,
            text: text,
            pageUrl: window.location.href,
            pagePath: window.location.pathname + window.location.hash,
            createdAt: new Date().toISOString(),
            resolved: false
        };

        // Guardar en Firebase
        try {
            await saveComment(comment);
            state.comments.push(comment);
            renderMarkers();
            closePopup();
        } catch (err) {
            console.error('Error guardando comentario:', err);
            alert('Error al guardar el comentario');
        }
    }

    // Guardar comentario en Firebase
    async function saveComment(comment) {
        const { db, doc, updateDoc, arrayUnion } = window.firebaseDB;
        const projectRef = doc(db, 'projects', projectId);
        await updateDoc(projectRef, {
            comments: arrayUnion(comment)
        });
    }

    // Cargar comentarios de Firebase
    async function loadComments() {
        const { db, doc, onSnapshot } = window.firebaseDB;
        const projectRef = doc(db, 'projects', projectId);

        onSnapshot(projectRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                state.comments = data.comments || [];
                renderMarkers();
            }
        });
    }

    // Renderizar marcadores
    function renderMarkers() {
        // Limpiar marcadores existentes
        document.querySelectorAll('.hotspot-marker').forEach(m => m.remove());

        // Filtrar comentarios de esta página
        const currentPath = window.location.pathname + window.location.hash;
        const pageComments = state.comments.filter(c => {
            const commentPath = c.pagePath || new URL(c.pageUrl).pathname;
            return commentPath === currentPath && !c.resolved;
        });

        // Crear marcadores
        pageComments.forEach((comment, index) => {
            const marker = document.createElement('div');
            marker.className = 'hotspot-marker';
            marker.style.left = comment.x + 'px';
            marker.style.top = comment.y + 'px';
            marker.textContent = index + 1;
            marker.onclick = (e) => {
                e.stopPropagation();
                showComment(comment, marker);
            };
            document.body.appendChild(marker);
        });
    }

    // Mostrar comentario
    function showComment(comment, marker) {
        const view = document.getElementById('hotspot-comment-view');
        const rect = marker.getBoundingClientRect();

        view.innerHTML = `
            <p>${comment.text}</p>
            <small>${timeAgo(comment.createdAt)}</small>
            <button onclick="window.hotspotWidget.resolveComment('${comment.id}')">✓ Resolver</button>
        `;

        view.style.left = (rect.right + 10) + 'px';
        view.style.top = rect.top + 'px';
        view.classList.add('active');

        // Cerrar al hacer click fuera
        setTimeout(() => {
            document.addEventListener('click', function closeView(e) {
                if (!view.contains(e.target)) {
                    view.classList.remove('active');
                    document.removeEventListener('click', closeView);
                }
            });
        }, 100);
    }

    // Resolver comentario
    async function resolveComment(commentId) {
        const { db, doc, updateDoc } = window.firebaseDB;
        const projectRef = doc(db, 'projects', projectId);

        const comment = state.comments.find(c => c.id === commentId);
        if (comment) {
            comment.resolved = true;
            await updateDoc(projectRef, {
                comments: state.comments
            });
            document.getElementById('hotspot-comment-view').classList.remove('active');
            renderMarkers();
        }
    }

    // Utilidad: tiempo relativo
    function timeAgo(date) {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        if (seconds < 60) return 'Ahora';
        if (seconds < 3600) return Math.floor(seconds / 60) + ' min';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
        return Math.floor(seconds / 86400) + 'd';
    }

    // Cargar Firebase SDK
    function loadFirebase() {
        return new Promise((resolve) => {
            if (window.firebaseDB) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.type = 'module';
            script.textContent = `
                import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
                import { getFirestore, doc, updateDoc, onSnapshot, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

                const app = initializeApp(${JSON.stringify(firebaseConfig)});
                const db = getFirestore(app);

                window.firebaseDB = { db, doc, updateDoc, onSnapshot, arrayUnion };
                window.dispatchEvent(new Event('firebase-ready'));
            `;
            document.head.appendChild(script);

            window.addEventListener('firebase-ready', resolve);
        });
    }

    // Inicializar
    async function init() {
        injectStyles();
        createWidget();
        await loadFirebase();
        await loadComments();

        // Re-renderizar cuando cambia la URL (SPA)
        window.addEventListener('popstate', renderMarkers);
        window.addEventListener('hashchange', renderMarkers);
    }

    // Exponer funciones globales
    window.hotspotWidget = {
        closePopup,
        submitComment,
        resolveComment
    };

    // Iniciar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
