-- 创建数据库
CREATE DATABASE IF NOT EXISTS rental_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rental_system;

-- 用户表
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    real_name VARCHAR(100) NOT NULL,
    role ENUM('admin', 'finance', 'sales') NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(20),
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 客户表
CREATE TABLE customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    credit_level ENUM('A', 'B', 'C', 'D') DEFAULT 'C',
    id_card VARCHAR(50),
    business_license VARCHAR(100),
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 供应商表
CREATE TABLE suppliers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    business_license VARCHAR(100),
    bank_account VARCHAR(100),
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 合作伙伴表
CREATE TABLE partners (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    commission_rate DECIMAL(5,2) DEFAULT 0.00,
    business_license VARCHAR(100),
    bank_account VARCHAR(100),
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 产品类别表
CREATE TABLE product_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 配件类别表
CREATE TABLE accessory_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 产品表
CREATE TABLE products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    category_id INT,
    name VARCHAR(100) NOT NULL,
    brand VARCHAR(100),
    model VARCHAR(100),
    specifications TEXT,
    purchase_price DECIMAL(10,2),
    rental_price_per_day DECIMAL(10,2),
    rental_price_per_month DECIMAL(10,2),
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES product_categories(id)
);

-- 设备表
CREATE TABLE devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    serial_number VARCHAR(100) UNIQUE NOT NULL,
    purchase_date DATE,
    purchase_price DECIMAL(10,2),
    supplier_id INT,
    warranty_expiry DATE,
    status ENUM('available', 'rented', 'maintenance', 'retired') DEFAULT 'available',
    location VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- 配件表
CREATE TABLE accessories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    category_id INT,
    brand VARCHAR(100),
    model VARCHAR(100),
    description TEXT,
    unit_price DECIMAL(10,2),
    stock_quantity INT DEFAULT 0,
    min_stock_level INT DEFAULT 5,
    supplier_id INT,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES accessory_categories(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- 采购订单表
CREATE TABLE purchase_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id INT NOT NULL,
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    total_amount DECIMAL(12,2),
    status ENUM('pending', 'confirmed', 'delivered', 'cancelled') DEFAULT 'pending',
    notes TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 采购订单明细表
CREATE TABLE purchase_order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    received_quantity INT DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 租赁订单表
CREATE TABLE rental_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INT NOT NULL,
    order_date DATE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    rental_type ENUM('daily', 'monthly') NOT NULL,
    total_amount DECIMAL(12,2),
    deposit DECIMAL(12,2),
    status ENUM('pending', 'active', 'expired', 'returned', 'cancelled') DEFAULT 'pending',
    notes TEXT,
    salesperson_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (salesperson_id) REFERENCES users(id)
);

-- 租赁订单明细表
CREATE TABLE rental_order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    device_id INT NOT NULL,
    daily_rate DECIMAL(10,2),
    monthly_rate DECIMAL(10,2),
    start_date DATE NOT NULL,
    end_date DATE,
    actual_return_date DATE,
    FOREIGN KEY (order_id) REFERENCES rental_orders(id),
    FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- 退租记录表
CREATE TABLE return_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    rental_order_id INT NOT NULL,
    return_date DATE NOT NULL,
    returned_by INT,
    condition_status ENUM('excellent', 'good', 'fair', 'poor', 'damaged') NOT NULL,
    damage_description TEXT,
    repair_cost DECIMAL(10,2) DEFAULT 0.00,
    penalty_fee DECIMAL(10,2) DEFAULT 0.00,
    total_deduction DECIMAL(10,2) DEFAULT 0.00,
    refund_amount DECIMAL(10,2),
    notes TEXT,
    processed_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (rental_order_id) REFERENCES rental_orders(id),
    FOREIGN KEY (returned_by) REFERENCES users(id),
    FOREIGN KEY (processed_by) REFERENCES users(id)
);

-- 财务记录表
CREATE TABLE financial_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    record_type ENUM('income', 'expense') NOT NULL,
    category VARCHAR(100) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    reference_id INT,
    reference_type VARCHAR(50),
    transaction_date DATE NOT NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 佣金结算表
CREATE TABLE commission_settlements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    partner_id INT NOT NULL,
    rental_order_id INT,
    settlement_date DATE NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'paid', 'cancelled') DEFAULT 'pending',
    notes TEXT,
    processed_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (partner_id) REFERENCES partners(id),
    FOREIGN KEY (rental_order_id) REFERENCES rental_orders(id),
    FOREIGN KEY (processed_by) REFERENCES users(id)
);

-- 插入初始数据
-- 插入默认管理员用户
INSERT INTO users (username, password, real_name, role, email, phone) VALUES 
('admin', '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQj', '系统管理员', 'admin', 'admin@rentalsystem.com', '13800000000');

-- 插入产品类别
INSERT INTO product_categories (name, description) VALUES 
('笔记本电脑', '各类品牌笔记本电脑'),
('台式电脑', '各类品牌台式电脑'),
('服务器', '企业级服务器'),
('主机', '各类品牌主机');

-- 插入配件类别
INSERT INTO accessory_categories (name, description) VALUES 
('CPU', '中央处理器'),
('内存', '内存条'),
('硬盘', '固态硬盘和机械硬盘'),
('显卡', '独立显卡'),
('主板', '电脑主板'),
('电源', '电脑电源'),
('显示器', '电脑显示器'),
('键盘鼠标', '键盘和鼠标套装'),
('外设', '其他外设配件');

-- 插入示例客户
INSERT INTO customers (name, contact_person, phone, email, address, credit_level, id_card) VALUES 
('测试科技有限公司', '张三', '13800138001', 'zhangsan@test.com', '北京市朝阳区测试路123号', 'A', '110101199001011234'),
('示例贸易公司', '李四', '13800138002', 'lisi@example.com', '上海市浦东新区示例街456号', 'B', '310101199002022345');

-- 插入示例供应商
INSERT INTO suppliers (name, contact_person, phone, email, address, bank_account) VALUES 
('惠普供应商', '王五', '13800138003', 'wangwu@hp.com', '深圳市南山区科技园', '6222021234567890123'),
('戴尔供应商', '赵六', '13800138004', 'zhaoliu@dell.com', '广州市天河区珠江新城', '6222021234567890456');

-- 插入示例合作伙伴
INSERT INTO partners (name, contact_person, phone, email, address, commission_rate, bank_account) VALUES 
('合作中介A', '钱七', '13800138005', 'qianqi@partner.com', '北京市海淀区中关村', 5.00, '6222021234567890789'),
('合作中介B', '孙八', '13800138006', 'sunba@partner.com', '上海市徐汇区漕河泾', 3.50, '6222021234567890123');