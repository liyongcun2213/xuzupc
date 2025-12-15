-- 租金管理模块数据库表

USE rental_system;

-- 1. 租金应收账单表
CREATE TABLE IF NOT EXISTS rent_receivable_bills (
    id INT PRIMARY KEY AUTO_INCREMENT,
    bill_number VARCHAR(50) UNIQUE NOT NULL COMMENT '账单编号',
    customer_id INT NOT NULL COMMENT '客户ID',
    customer_name VARCHAR(100) NOT NULL COMMENT '客户名称',
    rental_order_id INT NOT NULL COMMENT '租赁订单ID',
    order_number VARCHAR(50) NOT NULL COMMENT '订单编号',
    
    bill_period_start DATE NOT NULL COMMENT '账期开始日期',
    bill_period_end DATE NOT NULL COMMENT '账期结束日期',
    due_date DATE NOT NULL COMMENT '应收日期',
    
    bill_amount DECIMAL(12,2) NOT NULL COMMENT '账单金额',
    received_amount DECIMAL(12,2) DEFAULT 0.00 COMMENT '已收金额',
    remaining_amount DECIMAL(12,2) NOT NULL COMMENT '未收金额',
    
    status ENUM('pending', 'partial', 'paid', 'overdue', 'bad_debt') DEFAULT 'pending' COMMENT '账单状态：待支付、部分支付、已支付、逾期、坏账',
    payment_cycle ENUM('monthly', 'quarterly', 'half_yearly', 'yearly') DEFAULT 'quarterly' COMMENT '付款周期',
    
    grace_period_days INT DEFAULT 0 COMMENT '宽限期天数',
    overdue_days INT DEFAULT 0 COMMENT '逾期天数',
    
    notes TEXT COMMENT '备注',
    created_by INT COMMENT '创建人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (rental_order_id) REFERENCES rental_orders(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_customer (customer_id),
    INDEX idx_order (rental_order_id),
    INDEX idx_status (status),
    INDEX idx_due_date (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租金应收账单表';

-- 2. 租金实收记录表
CREATE TABLE IF NOT EXISTS rent_received_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    record_number VARCHAR(50) UNIQUE NOT NULL COMMENT '收款记录编号',
    bill_id INT NOT NULL COMMENT '关联应收账单ID',
    bill_number VARCHAR(50) NOT NULL COMMENT '账单编号',
    
    customer_id INT NOT NULL COMMENT '客户ID',
    customer_name VARCHAR(100) NOT NULL COMMENT '客户名称',
    
    received_amount DECIMAL(12,2) NOT NULL COMMENT '本次收款金额',
    received_date DATE NOT NULL COMMENT '收款日期',
    payment_method ENUM('cash', 'bank_transfer', 'alipay', 'wechat', 'check', 'other') NOT NULL COMMENT '收款方式',
    
    transaction_no VARCHAR(100) COMMENT '交易流水号',
    bank_account VARCHAR(100) COMMENT '收款账户',
    
    notes TEXT COMMENT '备注',
    operator_id INT NOT NULL COMMENT '操作员ID',
    operator_name VARCHAR(100) NOT NULL COMMENT '操作员姓名',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (bill_id) REFERENCES rent_receivable_bills(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (operator_id) REFERENCES users(id),
    INDEX idx_bill (bill_id),
    INDEX idx_customer (customer_id),
    INDEX idx_date (received_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租金实收记录表';

-- 3. 坏账审批记录表
CREATE TABLE IF NOT EXISTS rent_bad_debt_approvals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    bill_id INT NOT NULL COMMENT '账单ID',
    bill_number VARCHAR(50) NOT NULL COMMENT '账单编号',
    
    customer_id INT NOT NULL COMMENT '客户ID',
    customer_name VARCHAR(100) NOT NULL COMMENT '客户名称',
    
    bill_amount DECIMAL(12,2) NOT NULL COMMENT '账单金额',
    overdue_days INT NOT NULL COMMENT '逾期天数',
    
    reason TEXT NOT NULL COMMENT '认定原因',
    proof_files TEXT COMMENT '证明文件（JSON格式）',
    
    applicant_id INT NOT NULL COMMENT '申请人ID',
    applicant_name VARCHAR(100) NOT NULL COMMENT '申请人姓名',
    apply_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
    
    approver_id INT COMMENT '审批人ID',
    approver_name VARCHAR(100) COMMENT '审批人姓名',
    approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' COMMENT '审批状态',
    approval_time TIMESTAMP NULL COMMENT '审批时间',
    approval_notes TEXT COMMENT '审批意见',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (bill_id) REFERENCES rent_receivable_bills(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (applicant_id) REFERENCES users(id),
    FOREIGN KEY (approver_id) REFERENCES users(id),
    INDEX idx_bill (bill_id),
    INDEX idx_status (approval_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='坏账审批记录表';

-- 4. 租金预警记录表
CREATE TABLE IF NOT EXISTS rent_payment_alerts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    bill_id INT NOT NULL COMMENT '账单ID',
    bill_number VARCHAR(50) NOT NULL COMMENT '账单编号',
    
    customer_id INT NOT NULL COMMENT '客户ID',
    customer_name VARCHAR(100) NOT NULL COMMENT '客户名称',
    
    due_date DATE NOT NULL COMMENT '应收日期',
    bill_amount DECIMAL(12,2) NOT NULL COMMENT '账单金额',
    days_before_due INT NOT NULL COMMENT '距到期天数',
    
    alert_type ENUM('payment_due', 'overdue') DEFAULT 'payment_due' COMMENT '预警类型',
    alert_status ENUM('active', 'processed', 'dismissed') DEFAULT 'active' COMMENT '预警状态',
    
    notification_sent BOOLEAN DEFAULT FALSE COMMENT '是否已发送通知',
    notification_method VARCHAR(50) COMMENT '通知方式（短信/微信/邮件）',
    notification_time TIMESTAMP NULL COMMENT '通知时间',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (bill_id) REFERENCES rent_receivable_bills(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    INDEX idx_bill (bill_id),
    INDEX idx_customer (customer_id),
    INDEX idx_due_date (due_date),
    INDEX idx_status (alert_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租金预警记录表';

-- 插入初始数据（示例）
-- 注意：实际使用时需要根据现有租赁订单生成应收账单
