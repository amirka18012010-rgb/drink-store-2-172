let products = [], cart = [], currentUser = null, currentPage = 1, totalPages = 1, favorites = [];

const productsGrid = document.getElementById('productsGrid');
const categoryFilter = document.getElementById('categoryFilter');
const searchInput = document.getElementById('searchInput');
const resetFilterBtn = document.getElementById('resetFilterBtn');
const pagination = document.getElementById('pagination');
const cartOverlay = document.getElementById('cartOverlay');
const openCartBtn = document.getElementById('openCartBtn');
const closeCartBtn = document.getElementById('closeCartBtn');
const cartItems = document.getElementById('cartItems');
const cartTotal = document.getElementById('cartTotal');
const cartCount = document.getElementById('cartCount');
const checkoutBtn = document.getElementById('checkoutBtn');

const notifBtn = document.getElementById('notifBtn');
const notifBadge = document.getElementById('notifBadge');
const notifOverlay = document.getElementById('notifOverlay');
const closeNotifBtn = document.getElementById('closeNotifBtn');
const notifList = document.getElementById('notifList');
const markReadBtn = document.getElementById('markReadBtn');

const newsOverlay = document.getElementById('newsOverlay');
const closeNewsBtn = document.getElementById('closeNewsBtn');
const newsCloseBtn = document.getElementById('newsCloseBtn');

// ----- Загрузка категорий -----
function loadCategories() {
  fetch('/api/categories')
    .then(res => res.json())
    .then(cats => {
      categoryFilter.innerHTML = '<option value="all">Все</option>';
      cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        categoryFilter.appendChild(opt);
      });
    })
    .catch(err => console.error('Ошибка загрузки категорий:', err));
}

// ----- Загрузка товаров с пагинацией -----
function loadProducts(page = 1) {
  const category = categoryFilter.value;
  const search = searchInput.value.trim();
  const url = new URL('/api/products', window.location.origin);
  if (category && category !== 'all') url.searchParams.append('category', category);
  if (search) url.searchParams.append('search', search);
  url.searchParams.append('page', page);
  url.searchParams.append('limit', 12);

  fetch(url)
    .then(res => res.json())
    .then(data => {
      products = data.items || [];
      totalPages = data.totalPages || 1;
      currentPage = data.page || 1;
      renderProducts();
      renderPagination();
    })
    .catch(err => console.error('Ошибка загрузки товаров:', err));
}

function renderProducts() {
  if (products.length === 0) {
    productsGrid.innerHTML = `<p style="grid-column:1/-1; text-align:center; padding:40px; color:#7f8c8d;">Товары не найдены</p>`;
    return;
  }
  productsGrid.innerHTML = products.map(p => {
    const isFav = favorites.includes(p.id);
    return `
    <div class="product-card" data-id="${p.id}">
      <img class="product-img" src="${p.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23f0f2f5"/%3E%3Ctext x="50" y="55" text-anchor="middle" font-size="40" dy=".35em"%3E🥤%3C/text%3E%3C/svg%3E'}" alt="${p.name}">
      <div class="name">${p.name}</div>
      <div class="type">${p.category_name || 'Без категории'}</div>
      <div class="price">${p.price} ₽</div>
      <div style="display:flex; gap:10px; justify-content:center;">
        <button class="add-btn" data-id="${p.id}">➕</button>
        <button class="fav-btn ${isFav?'active':''}" data-id="${p.id}" style="background:none; border:none; font-size:22px; cursor:pointer;">${isFav?'❤️':'🤍'}</button>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('button')) return;
      window.location.href = `/product.html?id=${this.dataset.id}`;
    });
  });
  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(parseInt(btn.dataset.id));
    });
  });
  document.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(parseInt(btn.dataset.id));
    });
  });
}

function renderPagination() {
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i===currentPage?'active':''}" data-page="${i}">${i}</button>`;
  }
  pagination.innerHTML = html;
  pagination.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => loadProducts(parseInt(btn.dataset.page)));
  });
}

// ----- Избранное -----
function loadFavorites() {
  if (!currentUser) return;
  fetch('/api/favorites')
    .then(res => res.json())
    .then(data => {
      favorites = data;
      renderProducts();
    })
    .catch(err => console.error('Ошибка загрузки избранного:', err));
}

function toggleFavorite(productId) {
  if (!currentUser) {
    alert('Войдите, чтобы добавить в избранное');
    return;
  }
  const isFav = favorites.includes(productId);
  fetch(`/api/favorites/${productId}`, {
    method: isFav ? 'DELETE' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: isFav ? null : JSON.stringify({ productId })
  })
    .then(res => res.json())
    .then(() => {
      loadFavorites();
    })
    .catch(err => console.error('Ошибка избранного:', err));
}

// ----- Новости -----
function checkNews() {
  fetch('/api/news/latest')
    .then(res => res.json())
    .then(news => {
      if (news.length > 0 && document.getElementById('newsContent')) {
        document.getElementById('newsContent').innerHTML = news.map(n =>
          `<div style="margin-bottom:15px;"><h3>${n.title}</h3><p>${n.content}</p><small>${new Date(n.created_at).toLocaleDateString()}</small></div>`
        ).join('');
        if (newsOverlay) newsOverlay.classList.add('open');
      }
    })
    .catch(err => console.error('Ошибка загрузки новостей:', err));
}

function closeNews() {
  if (newsOverlay) newsOverlay.classList.remove('open');
}
if (closeNewsBtn) closeNewsBtn.addEventListener('click', closeNews);
if (newsCloseBtn) newsCloseBtn.addEventListener('click', closeNews);
if (newsOverlay) {
  newsOverlay.addEventListener('click', (e) => {
    if (e.target === newsOverlay) closeNews();
  });
}

// ----- Аутентификация -----
function loadUser() {
  fetch('/api/auth/me')
    .then(res => res.json())
    .then(data => {
      if (data.user) {
        currentUser = data.user;
        const authBtns = document.getElementById('authButtons');
        const userInfoDiv = document.getElementById('userInfo');
        const userNameSpan = document.getElementById('userName');
        if (authBtns) authBtns.style.display = 'none';
        if (userInfoDiv) userInfoDiv.style.display = 'flex';
        if (userNameSpan) userNameSpan.textContent = `${data.user.first_name} ${data.user.last_name}`;
        checkAdminStatus();
        loadFavorites();
        checkNews();
      } else {
        currentUser = null;
        const authBtns = document.getElementById('authButtons');
        const userInfoDiv = document.getElementById('userInfo');
        const adminLink = document.getElementById('adminLink');
        if (authBtns) authBtns.style.display = 'flex';
        if (userInfoDiv) userInfoDiv.style.display = 'none';
        if (adminLink) adminLink.style.display = 'none';
      }
    })
    .catch(err => console.error('Ошибка загрузки пользователя:', err));
}

function checkAdminStatus() {
  fetch('/api/admin/status')
    .then(res => res.json())
    .then(data => {
      const adminLink = document.getElementById('adminLink');
      if (adminLink) {
        if (data.isAdmin) {
          adminLink.style.display = 'flex';
          console.log('✅ Кнопка админки показана');
        } else {
          adminLink.style.display = 'none';
        }
      }
    })
    .catch(() => {
      const adminLink = document.getElementById('adminLink');
      if (adminLink) adminLink.style.display = 'none';
    });
}

// ----- Вход -----
const loginBtn = document.getElementById('loginBtn');
const closeLoginBtn = document.getElementById('closeLoginBtn');
const loginForm = document.getElementById('loginForm');
const loginInput = document.getElementById('loginInput');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const loginOverlayElem = document.getElementById('loginOverlay');

if (loginBtn) {
  loginBtn.addEventListener('click', () => {
    if (loginOverlayElem) loginOverlayElem.classList.add('open');
  });
}
if (closeLoginBtn) {
  closeLoginBtn.addEventListener('click', () => {
    if (loginOverlayElem) loginOverlayElem.classList.remove('open');
  });
}
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const login = loginInput.value;
    const password = passwordInput.value;
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (loginOverlayElem) loginOverlayElem.classList.remove('open');
          loginForm.reset();
          loadUser();
          loadCart();
        } else {
          if (loginError) loginError.textContent = data.error || 'Ошибка входа';
        }
      })
      .catch(() => {
        if (loginError) loginError.textContent = 'Ошибка соединения';
      });
  });
}

// ----- Регистрация -----
const registerBtn = document.getElementById('registerBtn');
const closeRegisterBtn = document.getElementById('closeRegisterBtn');
const registerForm = document.getElementById('registerForm');
const registerOverlayElem = document.getElementById('registerOverlay');
const regFirstName = document.getElementById('regFirstName');
const regLastName = document.getElementById('regLastName');
const regLogin = document.getElementById('regLogin');
const regPassword = document.getElementById('regPassword');
const registerError = document.getElementById('registerError');

if (registerBtn) {
  registerBtn.addEventListener('click', () => {
    if (registerOverlayElem) registerOverlayElem.classList.add('open');
  });
}
if (closeRegisterBtn) {
  closeRegisterBtn.addEventListener('click', () => {
    if (registerOverlayElem) registerOverlayElem.classList.remove('open');
  });
}
if (registerForm) {
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const firstName = regFirstName.value;
    const lastName = regLastName.value;
    const login = regLogin.value;
    const password = regPassword.value;
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, login, password })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (registerOverlayElem) registerOverlayElem.classList.remove('open');
          registerForm.reset();
          loadUser();
          loadCart();
        } else {
          if (registerError) registerError.textContent = data.error || 'Ошибка регистрации';
        }
      })
      .catch(() => {
        if (registerError) registerError.textContent = 'Ошибка соединения';
      });
  });
}

// ----- Выход -----
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    fetch('/api/auth/logout', { method: 'POST' })
      .then(() => {
        loadUser();
        loadCart();
      });
  });
}

// ----- Восстановление -----
// (оставляем как есть, уже было)

// ----- Корзина -----
function loadCart() {
  fetch('/api/cart')
    .then(res => res.json())
    .then(data => { cart = data; updateCartUI(); })
    .catch(err => console.error('Ошибка загрузки корзины:', err));
}

function addToCart(productId, quantity = 1) {
  const existing = cart.find(item => item.productId === productId);
  const newQty = existing ? existing.quantity + quantity : quantity;
  fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, quantity: newQty })
  })
    .then(res => res.json())
    .then(updatedCart => {
      cart = updatedCart;
      updateCartUI();
    })
    .catch(err => console.error('Ошибка добавления в корзину:', err));
}

function removeFromCart(productId) {
  fetch(`/api/cart/${productId}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(updatedCart => {
      cart = updatedCart;
      updateCartUI();
    })
    .catch(err => console.error('Ошибка удаления из корзины:', err));
}

function updateCartUI() {
  if (!cartItems || !cartTotal || !cartCount) {
    console.warn('Элементы корзины не найдены');
    return;
  }

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = count;

  if (cart.length === 0) {
    cartItems.innerHTML = `<li class="cart-empty">Корзина пуста 🛒</li>`;
    cartTotal.textContent = '0 ₽';
    return;
  }

  fetch('/api/products')
    .then(res => res.json())
    .then(data => {
      const allProducts = data.items || data;
      let total = 0;
      const itemsHtml = cart.map(item => {
        const product = allProducts.find(p => p.id === item.productId);
        if (!product) return '';
        const price = product.price;
        const subtotal = price * item.quantity;
        total += subtotal;
        return `
          <li class="cart-item">
            <div class="item-info">
              <span class="item-name">${product.name}</span>
              <span class="item-price">${price} ₽ × ${item.quantity}</span>
            </div>
            <div class="item-qty">
              <button data-id="${product.id}" data-action="decr">−</button>
              <span class="qty-num">${item.quantity}</span>
              <button data-id="${product.id}" data-action="incr">+</button>
              <span class="item-total">${subtotal} ₽</span>
            </div>
          </li>
        `;
      }).join('');
      cartItems.innerHTML = itemsHtml;
      cartTotal.textContent = total + ' ₽';

      document.querySelectorAll('.cart-item .item-qty button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = parseInt(e.target.dataset.id);
          const action = e.target.dataset.action;
          const current = cart.find(item => item.productId === id);
          if (!current) return;
          if (action === 'incr') {
            addToCart(id, 1);
          } else if (action === 'decr') {
            if (current.quantity > 1) {
              addToCart(id, -1);
            } else {
              removeFromCart(id);
            }
          }
        });
      });
    })
    .catch(err => console.error('Ошибка обновления корзины:', err));
}

// ----- Оформление заказа -----
if (checkoutBtn) {
  checkoutBtn.addEventListener('click', async () => {
    if (cart.length === 0) {
      alert('Корзина пуста');
      return;
    }
    if (!currentUser) {
      const loginOverlayElem2 = document.getElementById('loginOverlay');
      if (loginOverlayElem2) loginOverlayElem2.classList.add('open');
      return;
    }
    try {
      const response = await fetch('/api/orders', { method: 'POST' });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert(`Заказ №${data.orderId} создан! Сумма: ${data.total} ₽`);
        loadCart();
        closeCart();
      }
    } catch (err) {
      alert('Ошибка соединения');
    }
  });
}

// ----- Открытие/закрытие корзины -----
function openCart() {
  if (cartOverlay) cartOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadCart();
}
function closeCart() {
  if (cartOverlay) cartOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
if (openCartBtn) openCartBtn.addEventListener('click', openCart);
if (closeCartBtn) closeCartBtn.addEventListener('click', closeCart);
if (cartOverlay) {
  cartOverlay.addEventListener('click', (e) => {
    if (e.target === cartOverlay) closeCart();
  });
}

// ----- Фильтр и поиск -----
if (categoryFilter) categoryFilter.addEventListener('change', () => loadProducts(1));
if (resetFilterBtn) {
  resetFilterBtn.addEventListener('click', () => {
    if (categoryFilter) categoryFilter.value = 'all';
    if (searchInput) searchInput.value = '';
    loadProducts(1);
  });
}
if (searchInput) {
  searchInput.addEventListener('input', debounce(() => loadProducts(1), 300));
}

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ----- Закрытие модалок по клику вне -----
[document.getElementById('loginOverlay'), document.getElementById('registerOverlay'), document.getElementById('recoverOverlay'), document.getElementById('notifOverlay')].forEach(overlay => {
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  }
});

// ----- Уведомления -----
let notifications = [];
let notifInterval = null;

function loadNotifications() {
  fetch('/api/notifications')
    .then(r => r.json())
    .then(data => {
      notifications = data;
      updateNotifBadge();
      if (notifications.length > 0) {
        showToast(notifications[0].message);
      }
    })
    .catch(err => console.error('Ошибка загрузки уведомлений:', err));
}

function updateNotifBadge() {
  const count = notifications.length;
  if (count > 0 && notifBadge) {
    notifBadge.textContent = count;
    notifBadge.style.display = 'inline';
  } else if (notifBadge) {
    notifBadge.style.display = 'none';
  }
}

function markAllRead() {
  fetch('/api/notifications/read', { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        notifications = [];
        updateNotifBadge();
        if (notifOverlay) notifOverlay.classList.remove('open');
        document.querySelectorAll('.toast').forEach(el => el.remove());
      }
    });
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('show');
  }, 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function openNotifModal() {
  if (!notifList) return;
  if (notifications.length === 0) {
    notifList.innerHTML = '<p style="color:#7f8c8d;">Уведомлений нет</p>';
  } else {
    notifList.innerHTML = notifications.map(n =>
      `<div style="border-bottom:1px solid #ecf0f1; padding:8px 0;">
        <div>${n.message}</div>
        <small style="color:#7f8c8d;">${new Date(n.created_at).toLocaleString()}</small>
      </div>`
    ).join('');
  }
  if (notifOverlay) notifOverlay.classList.add('open');
}

function closeNotifModal() {
  if (notifOverlay) notifOverlay.classList.remove('open');
}

if (notifBtn) notifBtn.addEventListener('click', openNotifModal);
if (closeNotifBtn) closeNotifBtn.addEventListener('click', closeNotifModal);
if (notifOverlay) {
  notifOverlay.addEventListener('click', (e) => {
    if (e.target === notifOverlay) closeNotifModal();
  });
}
if (markReadBtn) markReadBtn.addEventListener('click', markAllRead);

function startNotifPolling() {
  loadNotifications();
  notifInterval = setInterval(loadNotifications, 30000);
}
startNotifPolling();

// ----- Фон -----
function applyBackground() {
  fetch('/api/background')
    .then(r => r.json())
    .then(data => {
      if (data.background) {
        document.body.style.backgroundImage = `url(${data.background})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundPosition = 'center';
        document.body.classList.add('has-bg');
      } else {
        document.body.style.backgroundImage = '';
        document.body.classList.remove('has-bg');
      }
    })
    .catch(err => console.error('Ошибка загрузки фона:', err));
}

// ----- Инициализация -----
loadCategories();
loadProducts();
loadCart();
loadUser();
applyBackground();