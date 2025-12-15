USE rental_system;

-- 建表（带 IF NOT EXISTS）
CREATE TABLE IF NOT EXISTS `device_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int DEFAULT NULL COMMENT '关联的产品ID',
  `product_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品型号',
  `product_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品名称',
  `accessory_category_id` int NOT NULL COMMENT '配件类别ID',
  `accessory_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配件名称',
  `brand` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '推荐品牌',
  `model` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '推荐型号',
  `quantity` int DEFAULT '1' COMMENT '所需数量',
  `is_required` tinyint(1) DEFAULT '1' COMMENT '是否必需',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_product_code` (`product_code`),
  KEY `idx_accessory_category` (`accessory_category_id`),
  CONSTRAINT `device_templates_ibfk_1` FOREIGN KEY (`accessory_category_id`) REFERENCES `accessory_categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备配件配置模板表';