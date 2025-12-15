-- 配件管理系统数据库结构
USE rental_system;

-- 1. 配件表 (更新现有表结构)
ALTER TABLE accessories 
ADD COLUMN IF NOT EXISTS model VARCHAR(255) COMMENT '型号规格',
ADD COLUMN IF NOT EXISTS brand VARCHAR(100) COMMENT '品牌',
ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2) COMMENT '采购价格',
ADD COLUMN IF NOT EXISTS purchase_date DATE COMMENT '采购时间',
ADD COLUMN IF NOT EXISTS stock_quantity INT DEFAULT 0 COMMENT '库存数量',
ADD COLUMN IF NOT EXISTS status ENUM('assembled', 'in_warehouse', 'scrapped') DEFAULT 'in_warehouse' COMMENT '状态：已组装，在仓库，报废';

-- 2. 配件批次表
CREATE TABLE IF NOT EXISTS accessory_batches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    accessory_id INT NOT NULL COMMENT '配件ID',
    batch_number VARCHAR(100) NOT NULL COMMENT '批次号',
    purchase_price DECIMAL(10,2) NOT NULL COMMENT '采购价格',
    purchase_date DATE NOT NULL COMMENT '采购日期',
    quantity INT NOT NULL COMMENT '采购数量',
    remaining_quantity INT NOT NULL COMMENT '剩余数量',
    supplier_id INT COMMENT '供应商ID',
    notes TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (accessory_id) REFERENCES accessories(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    UNIQUE KEY unique_batch_number (batch_number)
);

-- 3. 配件历史价格表
CREATE TABLE IF NOT EXISTS accessory_price_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    accessory_id INT NOT NULL COMMENT '配件ID',
    price DECIMAL(10,2) NOT NULL COMMENT '价格',
    month_year VARCHAR(7) NOT NULL COMMENT '年月(YYYY-MM)',
    recorded_by INT COMMENT '记录人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (accessory_id) REFERENCES accessories(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_accessory_year_month (accessory_id, month_year)
);

-- 4. 配件库存记录表
CREATE TABLE IF NOT EXISTS accessory_inventory_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    accessory_id INT NOT NULL COMMENT '配件ID',
    batch_id INT COMMENT '批次ID',
    record_type ENUM('in', 'out', 'adjustment') NOT NULL COMMENT '记录类型：入库，出库，调整',
    quantity INT NOT NULL COMMENT '数量',
    unit_price DECIMAL(10,2) COMMENT '单价',
    total_value DECIMAL(12,2) COMMENT '总价值',
    reference_type ENUM('purchase', 'assembly', 'return', 'check', 'scrap') COMMENT '引用类型：采购，组装，返还，盘点，报废',
    reference_id INT COMMENT '引用ID',
    notes TEXT COMMENT '备注',
    created_by INT COMMENT '创建人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accessory_id) REFERENCES accessories(id) ON DELETE CASCADE,
    FOREIGN KEY (batch_id) REFERENCES accessory_batches(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 5. 配件盘点表
CREATE TABLE IF NOT EXISTS accessory_inventory_checks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    check_date DATE NOT NULL COMMENT '盘点日期',
    check_month VARCHAR(7) NOT NULL COMMENT '盘点年月(YYYY-MM)',
    checked_by INT NOT NULL COMMENT '盘点人ID',
    status ENUM('draft', 'completed', 'approved') DEFAULT 'draft' COMMENT '状态：草稿，已完成，已批准',
    total_discrepancies INT DEFAULT 0 COMMENT '总差异数量',
    total_value_difference DECIMAL(12,2) DEFAULT 0.00 COMMENT '总价值差异',
    notes TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (checked_by) REFERENCES users(id) ON DELETE RESTRICT,
    UNIQUE KEY unique_check_month (check_month)
);

-- 6. 配件盘点明细表
CREATE TABLE IF NOT EXISTS accessory_inventory_check_details (
    id INT PRIMARY KEY AUTO_INCREMENT,
    check_id INT NOT NULL COMMENT '盘点ID',
    accessory_id INT NOT NULL COMMENT '配件ID',
    system_quantity INT NOT NULL COMMENT '系统数量',
    actual_quantity INT NOT NULL COMMENT '实际数量',
    difference INT NOT NULL COMMENT '差异数量',
    unit_price DECIMAL(10,2) NOT NULL COMMENT '单价',
    difference_value DECIMAL(12,2) NOT NULL COMMENT '差异价值',
    reason TEXT COMMENT '差异原因',
    action_taken ENUM('no_action', 'adjust_system', 'report_loss', 'other') DEFAULT 'no_action' COMMENT '采取的行动：无操作，调整系统，报告损失，其他',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (check_id) REFERENCES accessory_inventory_checks(id) ON DELETE CASCADE,
    FOREIGN KEY (accessory_id) REFERENCES accessories(id) ON DELETE CASCADE
);

-- 7. 配件配置表 (用于折旧率等配置)
CREATE TABLE IF NOT EXISTS accessory_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_name VARCHAR(100) NOT NULL COMMENT '设置名称',
    setting_value VARCHAR(255) NOT NULL COMMENT '设置值',
    description TEXT COMMENT '描述',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 插入默认配件配置
INSERT INTO accessory_settings (setting_name, setting_value, description) VALUES
('cpu_depreciation_rate', '0.20', 'CPU年折旧率(20%)'),
('cooler_depreciation_rate', '0.15', '散热器年折旧率(15%)'),
('motherboard_depreciation_rate', '0.10', '主板年折旧率(10%)'),
('memory_depreciation_rate', '0.15', '内存年折旧率(15%)'),
('storage_depreciation_rate', '0.20', '硬盘年折旧率(20%)'),
('graphics_depreciation_rate', '0.25', '显卡年折旧率(25%)'),
('case_depreciation_rate', '0.05', '机箱年折旧率(5%)'),
('power_depreciation_rate', '0.08', '电源年折旧率(8%)'),
('monitor_depreciation_rate', '0.12', '显示器年折旧率(12%)'),
('monthly_check_day', '25', '每月盘点日期(默认25号)'),
('price_update_reminder', '1', '是否每月提醒更新价格(1是/0否)');

-- 8. 配件月度统计表
CREATE TABLE IF NOT EXISTS accessory_monthly_stats (
    id INT PRIMARY KEY AUTO_INCREMENT,
    accessory_id INT NOT NULL COMMENT '配件ID',
    month_year VARCHAR(7) NOT NULL COMMENT '年月(YYYY-MM)',
    opening_stock INT DEFAULT 0 COMMENT '期初库存',
    opening_value DECIMAL(12,2) DEFAULT 0.00 COMMENT '期初价值',
    purchases INT DEFAULT 0 COMMENT '本月采购数量',
    purchase_value DECIMAL(12,2) DEFAULT 0.00 COMMENT '本月采购价值',
    assemblies_out INT DEFAULT 0 COMMENT '本月组装出库数量',
    assembly_out_value DECIMAL(12,2) DEFAULT 0.00 COMMENT '本月组装出库价值',
    returns_in INT DEFAULT 0 COMMENT '本月返还入库数量',
    return_in_value DECIMAL(12,2) DEFAULT 0.00 COMMENT '本月返还入库价值',
    adjustments INT DEFAULT 0 COMMENT '本月调整数量',
    adjustment_value DECIMAL(12,2) DEFAULT 0.00 COMMENT '本月调整价值',
    closing_stock INT DEFAULT 0 COMMENT '期末库存',
    closing_value DECIMAL(12,2) DEFAULT 0.00 COMMENT '期末价值',
    current_unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '当前单价',
    depreciation_rate DECIMAL(5,4) DEFAULT 0.0000 COMMENT '当月折旧率',
    depreciation_value DECIMAL(12,2) DEFAULT 0.00 COMMENT '当月折旧价值',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (accessory_id) REFERENCES accessories(id) ON DELETE CASCADE,
    UNIQUE KEY unique_accessory_year_month (accessory_id, month_year)
);

-- 创建索引以提高查询性能
CREATE INDEX idx_accessory_batches_accessory_id ON accessory_batches(accessory_id);
CREATE INDEX idx_accessory_price_history_accessory_id ON accessory_price_history(accessory_id);
CREATE INDEX idx_accessory_price_history_month_year ON accessory_price_history(month_year);
CREATE INDEX idx_inventory_records_accessory_id ON accessory_inventory_records(accessory_id);
CREATE INDEX idx_inventory_records_created_at ON accessory_inventory_records(created_at);
CREATE INDEX idx_inventory_check_details_check_id ON accessory_inventory_check_details(check_id);
CREATE INDEX idx_monthly_stats_month_year ON accessory_monthly_stats(month_year);