-- 更新租赁订单表，添加付款周期和合作伙伴字段
ALTER TABLE rental_orders 
ADD COLUMN payment_cycle ENUM('monthly', 'quarterly', 'yearly') DEFAULT 'quarterly' COMMENT '付款周期',
ADD COLUMN partner_id INT COMMENT '合作伙伴ID',
ADD COLUMN renewal_count INT DEFAULT 0 COMMENT '续租次数';

-- 添加合作伙伴表
CREATE TABLE IF NOT EXISTS partners (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '合作伙伴姓名',
    phone VARCHAR(20) COMMENT '联系电话',
    email VARCHAR(100) COMMENT '电子邮箱',
    commission_rate DECIMAL(5,2) DEFAULT 5.00 COMMENT '佣金比例(%)',
    status ENUM('active', 'inactive') DEFAULT 'active' COMMENT '状态',
    notes TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 添加外键约束
ALTER TABLE rental_orders 
ADD FOREIGN KEY (partner_id) REFERENCES partners(id);

-- 更新租赁订单明细表，添加设备编号和规格型号
ALTER TABLE rental_order_items
ADD COLUMN device_code VARCHAR(50) COMMENT '设备编号',
ADD COLUMN specifications VARCHAR(200) COMMENT '规格型号',
ADD COLUMN quantity INT DEFAULT 1 COMMENT '数量';

-- 添加奖金记录表
CREATE TABLE IF NOT EXISTS commission_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    partner_id INT NOT NULL COMMENT '合作伙伴ID',
    rental_order_id INT NOT NULL COMMENT '租赁订单ID',
    commission_amount DECIMAL(10,2) NOT NULL COMMENT '佣金金额',
    commission_rate DECIMAL(5,2) NOT NULL COMMENT '佣金比例(%)',
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '计算时间',
    paid_at TIMESTAMP NULL COMMENT '支付时间',
    status ENUM('pending', 'paid') DEFAULT 'pending' COMMENT '状态',
    notes TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (partner_id) REFERENCES partners(id),
    FOREIGN KEY (rental_order_id) REFERENCES rental_orders(id)
);