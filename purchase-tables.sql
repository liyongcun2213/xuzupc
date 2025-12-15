-- 采购管理相关表结构
USE rental_system;

-- 采购批次表
CREATE TABLE IF NOT EXISTS purchase_batches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    batch_no VARCHAR(50) UNIQUE NOT NULL COMMENT '批次号',
    supplier_id INT NOT NULL COMMENT '供应商ID',
    purchase_date DATE NOT NULL COMMENT '采购日期',
    expected_delivery_date DATE COMMENT '预计到货日期',
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '总金额',
    paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '已支付金额',
    status ENUM('pending', 'approved', 'delivered', 'completed', 'cancelled') DEFAULT 'pending' COMMENT '状态',
    notes TEXT COMMENT '备注',
    created_by INT NOT NULL COMMENT '创建人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 采购配件明细表
CREATE TABLE IF NOT EXISTS purchase_accessory_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    batch_id INT NOT NULL COMMENT '批次ID',
    accessory_id INT NOT NULL COMMENT '配件ID',
    quantity INT NOT NULL COMMENT '采购数量',
    unit_price DECIMAL(10,2) NOT NULL COMMENT '单价',
    total_price DECIMAL(12,2) NOT NULL COMMENT '小计',
    delivered_quantity INT NOT NULL DEFAULT 0 COMMENT '已入库数量',
    status ENUM('pending', 'partial_delivered', 'delivered') DEFAULT 'pending' COMMENT '入库状态',
    notes TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES purchase_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (accessory_id) REFERENCES accessories(id)
);

-- 采购设备明细表
CREATE TABLE IF NOT EXISTS purchase_device_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    batch_id INT NOT NULL COMMENT '批次ID',
    product_id INT NOT NULL COMMENT '产品ID',
    quantity INT NOT NULL COMMENT '采购数量',
    unit_price DECIMAL(10,2) NOT NULL COMMENT '单价',
    total_price DECIMAL(12,2) NOT NULL COMMENT '小计',
    delivered_quantity INT NOT NULL DEFAULT 0 COMMENT '已入库数量',
    status ENUM('pending', 'partial_delivered', 'delivered') DEFAULT 'pending' COMMENT '入库状态',
    notes TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES purchase_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 采购审批记录表
CREATE TABLE IF NOT EXISTS purchase_approvals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    batch_id INT NOT NULL COMMENT '批次ID',
    approval_type ENUM('approve', 'payment', 'cancel', 'complete') NOT NULL COMMENT '审批类型',
    approver_id INT NOT NULL COMMENT '审批人ID',
    approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' COMMENT '审批状态',
    approval_date DATETIME COMMENT '审批日期',
    amount DECIMAL(12,2) COMMENT '审批金额(支付时使用)',
    notes TEXT COMMENT '审批意见',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES purchase_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (approver_id) REFERENCES users(id)
);

-- 采购入库记录表
CREATE TABLE IF NOT EXISTS purchase_stock_ins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    batch_id INT NOT NULL COMMENT '批次ID',
    item_type ENUM('accessory', 'device') NOT NULL COMMENT '项目类型',
    item_id INT NOT NULL COMMENT '项目ID(配件ID或设备ID)',
    quantity INT NOT NULL COMMENT '入库数量',
    stock_date DATE NOT NULL COMMENT '入库日期',
    operator_id INT NOT NULL COMMENT '操作员ID',
    notes TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES purchase_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (operator_id) REFERENCES users(id)
);

-- 插入示例数据
INSERT INTO purchase_batches (batch_no, supplier_id, purchase_date, expected_delivery_date, total_amount, status, notes, created_by) VALUES
('PO20251201001', 1, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), 15000.00, 'pending', '采购CPU和内存', 1),
('PO20251201002', 2, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 10 DAY), 25000.00, 'approved', '采购整机设备', 1);

-- 插入配件采购示例
INSERT INTO purchase_accessory_items (batch_id, accessory_id, quantity, unit_price, total_price, delivered_quantity, status, notes) VALUES
(1, 1, 10, 800.00, 8000.00, 0, 'pending', 'Intel i5处理器'),
(1, 3, 20, 350.00, 7000.00, 0, 'pending', 'DDR4 16GB内存条');

-- 插入设备采购示例
INSERT INTO purchase_device_items (batch_id, product_id, quantity, unit_price, total_price, delivered_quantity, status, notes) VALUES
(2, 1, 5, 5000.00, 25000.00, 0, 'pending', '高性能办公电脑');

-- 插入审批记录示例
INSERT INTO purchase_approvals (batch_id, approval_type, approver_id, approval_status, approval_date, notes) VALUES
(2, 'approve', 1, 'approved', NOW(), '审批通过，可以采购');