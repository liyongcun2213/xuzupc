-- 客户消费管理相关表

-- 1. 客户账户表（基于 customers 表的客户）
CREATE TABLE IF NOT EXISTS customer_accounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    customer_id INT NOT NULL COMMENT '客户ID（关联customers表）',
    customer_code VARCHAR(50) NOT NULL COMMENT '客户编号',
    customer_name VARCHAR(100) NOT NULL COMMENT '客户名称',
    prepaid_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '预付金额',
    consumed_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '已消耗金额',
    balance DECIMAL(10,2) DEFAULT 0.00 COMMENT '余额（预付-消耗）',
    unallocated_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '待分配收款余额',
    status ENUM('paid', 'overdue', 'terminated') DEFAULT 'paid' COMMENT '状态：已缴费、已欠费、已退租',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_customer_id (customer_id),
    INDEX idx_customer_code (customer_code),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户账户表';

-- 2. 缴费记录表
CREATE TABLE IF NOT EXISTS payment_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    customer_id INT NOT NULL COMMENT '客户ID',
    customer_code VARCHAR(50) NOT NULL COMMENT '客户编号',
    customer_name VARCHAR(100) NOT NULL COMMENT '客户名称',
    payment_amount DECIMAL(10,2) NOT NULL COMMENT '缴费金额',
    payment_date DATETIME NOT NULL COMMENT '缴费日期',
    payment_method VARCHAR(50) DEFAULT NULL COMMENT '支付方式（现金、转账、微信、支付宝等）',
    payment_type ENUM('rent','prepaid') DEFAULT 'rent' COMMENT '收款类型：租金/预付',
    operator VARCHAR(50) DEFAULT NULL COMMENT '操作员',
    notes TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer_id (customer_id),
    INDEX idx_payment_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='缴费记录表';

-- 3. 每日扣费记录表
CREATE TABLE IF NOT EXISTS daily_charge_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    customer_id INT NOT NULL COMMENT '客户ID',
    customer_code VARCHAR(50) NOT NULL COMMENT '客户编号',
    customer_name VARCHAR(100) NOT NULL COMMENT '客户名称',
    rental_id INT NOT NULL COMMENT '租赁订单ID',
    device_id INT NOT NULL COMMENT '设备ID',
    device_code VARCHAR(50) NOT NULL COMMENT '设备编号',
    daily_rate DECIMAL(10,2) NOT NULL COMMENT '日租金',
    charge_date DATE NOT NULL COMMENT '扣费日期',
    charge_amount DECIMAL(10,2) NOT NULL COMMENT '扣费金额',
    balance_before DECIMAL(10,2) NOT NULL COMMENT '扣费前余额',
    balance_after DECIMAL(10,2) NOT NULL COMMENT '扣费后余额',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer_id (customer_id),
    INDEX idx_charge_date (charge_date),
    INDEX idx_rental_id (rental_id),
    UNIQUE KEY uk_charge (customer_id, rental_id, device_id, charge_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每日扣费记录表';

-- 4. 客户消费明细表
CREATE TABLE IF NOT EXISTS customer_transaction_details (
    id INT PRIMARY KEY AUTO_INCREMENT,
    customer_id INT NOT NULL COMMENT '客户ID',
    customer_code VARCHAR(50) NOT NULL COMMENT '客户编号',
    transaction_type ENUM('payment', 'charge', 'refund', 'adjustment') NOT NULL COMMENT '交易类型：缴费、扣费、退款、调整',
    amount DECIMAL(10,2) NOT NULL COMMENT '金额（正数为增加，负数为减少）',
    balance_before DECIMAL(10,2) NOT NULL COMMENT '交易前余额',
    balance_after DECIMAL(10,2) NOT NULL COMMENT '交易后余额',
    transaction_date DATETIME NOT NULL COMMENT '交易日期',
    related_id INT DEFAULT NULL COMMENT '关联ID（缴费记录ID或扣费记录ID）',
    notes TEXT COMMENT '备注',
    operator VARCHAR(50) DEFAULT NULL COMMENT '操作员',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer_id (customer_id),
    INDEX idx_transaction_date (transaction_date),
    INDEX idx_transaction_type (transaction_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户消费明细表';

-- 初始化现有客户的账户数据（从 customers 表同步）
INSERT INTO customer_accounts (customer_id, customer_code, customer_name, prepaid_amount, consumed_amount, balance, status)
SELECT 
    c.id as customer_id,
    CONCAT('KH', LPAD(c.id, 4, '0')) as customer_code,
    c.name as customer_name,
    0.00 as prepaid_amount,
    0.00 as consumed_amount,
    0.00 as balance,
    'paid' as status
FROM customers c
WHERE c.status = 'active'
ON DUPLICATE KEY UPDATE
    customer_name = VALUES(customer_name),
    customer_code = VALUES(customer_code);

-- 5. 客户账单表（按客户+账期汇总）
CREATE TABLE IF NOT EXISTS customer_bills (
    id INT PRIMARY KEY AUTO_INCREMENT,
    bill_number VARCHAR(50) NOT NULL COMMENT '账单编号（如 BD20251126001）',
    customer_id INT NOT NULL COMMENT '客户ID（关联customers表）',
    payment_cycle ENUM('monthly', 'quarterly', 'yearly') NOT NULL COMMENT '付款周期',
    period_start DATE NOT NULL COMMENT '账单开始日期',
    period_end DATE NOT NULL COMMENT '账单结束日期',
    bill_date DATE NOT NULL COMMENT '出账日期',
    amount DECIMAL(12,2) NOT NULL COMMENT '账单金额',
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '累计打折金额',
    status ENUM('unpaid', 'paid', 'cancelled') DEFAULT 'unpaid' COMMENT '账单状态',
    item_count INT DEFAULT 0 COMMENT '账单包含的项目数量',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_bill_number (bill_number),
    KEY idx_customer_id (customer_id),
    KEY idx_bill_date (bill_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户账单表';
