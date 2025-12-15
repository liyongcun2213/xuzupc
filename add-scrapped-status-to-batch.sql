-- 为 accessory_batch_stock 表的 status 字段添加 'scrapped' 状态

ALTER TABLE accessory_batch_stock 
MODIFY COLUMN status ENUM('in_stock', 'in_use', 'exhausted', 'scrapped') DEFAULT 'in_stock' COMMENT '状态：在库、使用中、已用完、已报废';
