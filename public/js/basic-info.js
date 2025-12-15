// 基础信息管理页面JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // 初始加载客户数据
    loadCustomers();
    
    // 标签页切换事件
    document.getElementById('suppliers-tab').addEventListener('shown.bs.tab', loadSuppliers);
    document.getElementById('partners-tab').addEventListener('shown.bs.tab', loadPartners);
    document.getElementById('users-tab').addEventListener('shown.bs.tab', loadUsers);
    
    // 搜索事件
    document.getElementById('customerSearchBtn').addEventListener('click', loadCustomers);
    document.getElementById('customerSearch').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') loadCustomers();
    });
    
    document.getElementById('supplierSearchBtn').addEventListener('click', loadSuppliers);
    document.getElementById('supplierSearch').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') loadSuppliers();
    });
    
    document.getElementById('partnerSearchBtn').addEventListener('click', loadPartners);
    document.getElementById('partnerSearch').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') loadPartners();
    });
});

// ==================== 客户管理 ====================
function loadCustomers() {
    const keyword = document.getElementById('customerSearch').value.trim();
    const params = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
    
    fetch('/api/customers' + params)
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('customersTableBody');
            
            if (data.success && data.data.length > 0) {
                tbody.innerHTML = data.data.map(customer => `
                    <tr>
                        <td>${customer.name}</td>
                        <td>${customer.contact_person}</td>
                        <td>${customer.contact_phone}</td>
                        <td>${customer.address || '-'}</td>
                        <td><span class="badge bg-${getCreditBadgeClass(customer.credit_rating)}">${customer.credit_rating || 'B'}</span></td>
                        <td>${new Date(customer.created_at).toLocaleDateString()}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary action-btn" onclick="editCustomer(${customer.id})">
                                <i class="bi bi-pencil"></i> 编辑
                            </button>
                            <button class="btn btn-sm btn-outline-danger action-btn" onclick="deleteCustomer(${customer.id}, '${customer.name}')">
                                <i class="bi bi-trash"></i> 删除
                            </button>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无客户数据</td></tr>';
            }
        })
        .catch(error => {
            console.error('加载客户数据失败:', error);
            alert('加载失败，请刷新重试');
        });
}

function getCreditBadgeClass(rating) {
    const classes = { 'A': 'success', 'B': 'primary', 'C': 'warning', 'D': 'danger' };
    return classes[rating] || 'secondary';
}

function submitCustomer() {
    const form = document.getElementById('addCustomerForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('addCustomerModal')).hide();
            form.reset();
            loadCustomers();
            alert('客户添加成功');
        } else {
            alert('添加失败: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('添加失败');
    });
}

function editCustomer(id) {
    fetch('/api/customers/' + id)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const form = document.getElementById('editCustomerForm');
                const customer = data.data;
                
                form.querySelector('[name="id"]').value = customer.id;
                form.querySelector('[name="name"]').value = customer.name;
                form.querySelector('[name="contact_person"]').value = customer.contact_person;
                form.querySelector('[name="contact_phone"]').value = customer.contact_phone;
                form.querySelector('[name="address"]').value = customer.address || '';
                form.querySelector('[name="credit_rating"]').value = customer.credit_rating || 'B';
                form.querySelector('[name="notes"]').value = customer.notes || '';
                
                new bootstrap.Modal(document.getElementById('editCustomerModal')).show();
            }
        });
}

function updateCustomer() {
    const form = document.getElementById('editCustomerForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    const id = data.id;
    
    fetch('/api/customers/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('editCustomerModal')).hide();
            loadCustomers();
            alert('客户更新成功');
        } else {
            alert('更新失败: ' + data.message);
        }
    });
}

function deleteCustomer(id, name) {
    if (!confirm(`确定要删除客户"${name}"吗？`)) return;
    
    fetch('/api/customers/' + id, { method: 'DELETE' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadCustomers();
                alert('删除成功');
            } else {
                alert('删除失败: ' + data.message);
            }
        });
}

// ==================== 供应商管理 ====================
function loadSuppliers() {
    const keyword = document.getElementById('supplierSearch').value.trim();
    const params = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
    
    fetch('/api/suppliers' + params)
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('suppliersTableBody');
            
            if (data.success && data.data.length > 0) {
                tbody.innerHTML = data.data.map(supplier => `
                    <tr>
                        <td>${supplier.name}</td>
                        <td>${supplier.contact_person}</td>
                        <td>${supplier.contact_phone}</td>
                        <td>${supplier.address || '-'}</td>
                        <td>${new Date(supplier.created_at).toLocaleDateString()}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary action-btn" onclick="editSupplier(${supplier.id})">
                                <i class="bi bi-pencil"></i> 编辑
                            </button>
                            <button class="btn btn-sm btn-outline-danger action-btn" onclick="deleteSupplier(${supplier.id}, '${supplier.name}')">
                                <i class="bi bi-trash"></i> 删除
                            </button>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">暂无供应商数据</td></tr>';
            }
        })
        .catch(error => {
            console.error('加载供应商数据失败:', error);
            alert('加载失败，请刷新重试');
        });
}

function submitSupplier() {
    const form = document.getElementById('addSupplierForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('addSupplierModal')).hide();
            form.reset();
            loadSuppliers();
            alert('供应商添加成功');
        } else {
            alert('添加失败: ' + data.message);
        }
    });
}

function editSupplier(id) {
    fetch('/api/suppliers/' + id)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const form = document.getElementById('editSupplierForm');
                const supplier = data.data;
                
                form.querySelector('[name="id"]').value = supplier.id;
                form.querySelector('[name="name"]').value = supplier.name;
                form.querySelector('[name="contact_person"]').value = supplier.contact_person;
                form.querySelector('[name="contact_phone"]').value = supplier.contact_phone;
                form.querySelector('[name="address"]').value = supplier.address || '';
                form.querySelector('[name="notes"]').value = supplier.notes || '';
                
                new bootstrap.Modal(document.getElementById('editSupplierModal')).show();
            }
        });
}

function updateSupplier() {
    const form = document.getElementById('editSupplierForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    const id = data.id;
    
    fetch('/api/suppliers/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('editSupplierModal')).hide();
            loadSuppliers();
            alert('供应商更新成功');
        } else {
            alert('更新失败: ' + data.message);
        }
    });
}

function deleteSupplier(id, name) {
    if (!confirm(`确定要删除供应商"${name}"吗？`)) return;
    
    fetch('/api/suppliers/' + id, { method: 'DELETE' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadSuppliers();
                alert('删除成功');
            } else {
                alert('删除失败: ' + data.message);
            }
        });
}

// ==================== 合作伙伴管理 ====================
function loadPartners() {
    const keyword = document.getElementById('partnerSearch').value.trim();
    const params = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
    
    fetch('/api/partners' + params)
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('partnersTableBody');
            
            if (data.success && data.data.length > 0) {
                tbody.innerHTML = data.data.map(partner => `
                    <tr>
                        <td>${partner.name}</td>
                        <td>${partner.contact_person || '-'}</td>
                        <td>${partner.phone || '-'}</td>
                        <td>${partner.commission_rate}%</td>
                        <td>
                            <span class="badge bg-${partner.status === 'active' ? 'success' : 'secondary'}">
                                ${partner.status === 'active' ? '活跃' : '非活跃'}
                            </span>
                        </td>
                        <td>${new Date(partner.created_at).toLocaleDateString()}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary action-btn" onclick="editPartner(${partner.id})">
                                <i class="bi bi-pencil"></i> 编辑
                            </button>
                            <button class="btn btn-sm btn-outline-danger action-btn" onclick="deletePartner(${partner.id}, '${partner.name}')">
                                <i class="bi bi-trash"></i> 删除
                            </button>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无合作伙伴数据</td></tr>';
            }
        })
        .catch(error => {
            console.error('加载合作伙伴数据失败:', error);
            alert('加载失败，请刷新重试');
        });
}

function submitPartner() {
    const form = document.getElementById('addPartnerForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('addPartnerModal')).hide();
            form.reset();
            loadPartners();
            alert('合作伙伴添加成功');
        } else {
            alert('添加失败: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('添加失败');
    });
}

function editPartner(id) {
    fetch('/api/partners/' + id)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const form = document.getElementById('editPartnerForm');
                const partner = data.data;
                
                form.querySelector('[name="id"]').value = partner.id;
                form.querySelector('[name="name"]').value = partner.name;
                form.querySelector('[name="contact_person"]').value = partner.contact_person || '';
                form.querySelector('[name="phone"]').value = partner.phone || '';
                form.querySelector('[name="commission_rate"]').value = partner.commission_rate;
                form.querySelector('[name="status"]').value = partner.status;
                form.querySelector('[name="notes"]').value = partner.notes || '';
                
                new bootstrap.Modal(document.getElementById('editPartnerModal')).show();
            }
        });
}

function updatePartner() {
    const form = document.getElementById('editPartnerForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    const id = data.id;
    
    fetch('/api/partners/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('editPartnerModal')).hide();
            loadPartners();
            alert('合作伙伴更新成功');
        } else {
            alert('更新失败: ' + data.message);
        }
    });
}

function deletePartner(id, name) {
    if (!confirm(`确定要删除合作伙伴"${name}"吗？`)) return;
    
    fetch('/api/partners/' + id, { method: 'DELETE' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadPartners();
                alert('删除成功');
            } else {
                alert('删除失败: ' + data.message);
            }
        });
}

// ==================== 用户管理 ====================
function loadUsers() {
    fetch('/api/users')
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('usersTableBody');
            
            if (data.success && data.data.length > 0) {
                tbody.innerHTML = data.data.map(user => `
                    <tr>
                        <td>${user.username}</td>
                        <td>${user.real_name}</td>
                        <td><span class="badge bg-${getRoleBadgeClass(user.role)}">${getRoleText(user.role)}</span></td>
                        <td>${user.email || '-'}</td>
                        <td><span class="badge bg-${user.status === 'active' ? 'success' : 'secondary'}">${user.status === 'active' ? '正常' : '禁用'}</span></td>
                        <td>${new Date(user.created_at).toLocaleDateString()}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary action-btn" onclick="editUser(${user.id})">
                                <i class="bi bi-pencil"></i> 编辑
                            </button>
                            <button class="btn btn-sm btn-outline-danger action-btn" onclick="deleteUser(${user.id}, '${user.username}')">
                                <i class="bi bi-trash"></i> 删除
                            </button>
                        </td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">暂无用户数据</td></tr>';
            }
        });
}

function getRoleBadgeClass(role) {
    const classes = { 'admin': 'danger', 'user': 'primary', 'viewer': 'info' };
    return classes[role] || 'secondary';
}

function getRoleText(role) {
    const texts = { 'admin': '管理员', 'user': '普通用户', 'viewer': '查看者' };
    return texts[role] || role;
}

function submitUser() {
    const form = document.getElementById('addUserForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
            form.reset();
            loadUsers();
            alert('用户添加成功');
        } else {
            alert('添加失败: ' + data.message);
        }
    });
}

function editUser(id) {
    fetch('/api/users/' + id)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const form = document.getElementById('editUserForm');
                const user = data.data;
                
                form.querySelector('[name="id"]').value = user.id;
                form.querySelector('[name="username"]').value = user.username;
                form.querySelector('[name="real_name"]').value = user.real_name;
                form.querySelector('[name="role"]').value = user.role;
                form.querySelector('[name="email"]').value = user.email || '';
                
                new bootstrap.Modal(document.getElementById('editUserModal')).show();
            }
        });
}

function updateUser() {
    const form = document.getElementById('editUserForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    const id = data.id;
    
    fetch('/api/users/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('editUserModal')).hide();
            loadUsers();
            alert('用户更新成功');
        } else {
            alert('更新失败: ' + data.message);
        }
    });
}

function deleteUser(id, username) {
    if (!confirm(`确定要删除用户"${username}"吗？`)) return;
    
    fetch('/api/users/' + id, { method: 'DELETE' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadUsers();
                alert('删除成功');
            } else {
                alert('删除失败: ' + data.message);
            }
        });
}
