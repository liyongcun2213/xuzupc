-- 租金调整历史记录表
USE rental_system;

CREATE TABLE IF NOT EXISTS rental_rent_adjustments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL COMMENT '租赁订单ID',
    order_item_id INT NOT NULL COMMENT '租赁订单明细ID',
    device_id INT NULL COMMENT '设备ID',
    device_code VARCHAR(50) NULL COMMENT '设备编号',
    old_monthly_rate DECIMAL(10,2) NOT NULL COMMENT '调整前月租金',
    new_monthly_rate DECIMAL(10,2) NOT NULL COMMENT '调整后月租金',
    adjust_effective_date DATE NOT NULL COMMENT '调整生效日期',
    adjusted_by INT NULL COMMENT '操作人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    notes VARCHAR(255) NULL COMMENT '备注',
    FOREIGN KEY (order_id) REFERENCES rental_orders(id),
    FOREIGN KEY (order_item_id) REFERENCES rental_order_items(id),
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (adjusted_by) REFERENCES users(id)
);

CREATE INDEX idx_rent_adjust_order_id ON rental_rent_adjustments(order_id);
CREATE INDEX idx_rent_adjust_item_id ON rental_rent_adjustments(order_item_id);
CREATE INDEX idx_rent_adjust_device_id ON rental_rent_adjustments(device_id);
