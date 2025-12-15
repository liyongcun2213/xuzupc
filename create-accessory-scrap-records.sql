-- 创建配件报废记录表
CREATE TABLE IF NOT EXISTS accessory_scrap_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    accessory_id INT NOT NULL COMMENT '配件ID',
    batch_stock_id INT NULL COMMENT '批次库存ID',
    device_id INT NULL COMMENT '来源设备ID',
    device_code VARCHAR(50) NULL COMMENT '设备编号',
    quantity INT NOT NULL DEFAULT 1 COMMENT '报废数量',
    purchase_price DECIMAL(10,2) NULL COMMENT '采购价格',
    scrap_reason VARCHAR(255) NULL COMMENT '报废原因',
    scrap_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '报废日期',
    created_by INT NULL COMMENT '操作人',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accessory_id) REFERENCES accessories(id),
    FOREIGN KEY (batch_stock_id) REFERENCES accessory_batch_stock(id),
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_accessory_scrap (accessory_id),
    INDEX idx_batch_stock_scrap (batch_stock_id),
    INDEX idx_device_scrap (device_id)
) COMMENT='配件报废记录表';
