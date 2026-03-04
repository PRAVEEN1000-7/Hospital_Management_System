-- Sample medicines for testing prescription builder autocomplete
-- Focuses on tablets to test the "tablets first" sorting feature

INSERT INTO medicines (hospital_id, name, generic_name, category, strength, manufacturer, selling_price, purchase_price, unit_of_measure, reorder_level, is_active) VALUES
-- Common tablets (should appear first in search results)
('a0000000-0000-0000-0000-000000000001', 'Paracetamol 500mg', 'Paracetamol', 'tablet', '500mg', 'Generic Pharma', 2.50, 1.50, 'strip', 50, true),
('a0000000-0000-0000-0000-000000000001', 'Paracetamol 650mg', 'Paracetamol', 'tablet', '650mg', 'Generic Pharma', 3.00, 2.00, 'strip', 50, true),
('a0000000-0000-0000-0000-000000000001', 'Ibuprofen 400mg', 'Ibuprofen', 'tablet', '400mg', 'Pain Relief Co', 5.00, 3.00, 'strip', 30, true),
('a0000000-0000-0000-0000-000000000001', 'Aspirin 75mg', 'Acetylsalicylic Acid', 'tablet', '75mg', 'Cardio Pharma', 4.50, 2.50, 'strip', 40, true),
('a0000000-0000-0000-0000-000000000001', 'Metformin 500mg', 'Metformin HCl', 'tablet', '500mg', 'Diabetes Care Ltd', 8.00, 5.00, 'strip', 60, true),
('a0000000-0000-0000-0000-000000000001', 'Amlodipine 5mg', 'Amlodipine Besylate', 'tablet', '5mg', 'BP Control Inc', 6.50, 4.00, 'strip', 40, true),
('a0000000-0000-0000-0000-000000000001', 'Atorvastatin 10mg', 'Atorvastatin Calcium', 'tablet', '10mg', 'Lipid Solutions', 12.00, 8.00, 'strip', 30, true),
('a0000000-0000-0000-0000-000000000001', 'Pantoprazole 40mg', 'Pantoprazole Sodium', 'tablet', '40mg', 'Gastro Med', 7.50, 4.50, 'strip', 45, true),
('a0000000-0000-0000-0000-000000000001', 'Azithromycin 500mg', 'Azithromycin', 'tablet', '500mg', 'Antibiotics Plus', 15.00, 10.00, 'strip', 20, true),
('a0000000-0000-0000-0000-000000000001', 'Vitamin D3 60000IU', 'Cholecalciferol', 'tablet', '60000IU', 'Vitamin World', 10.00, 6.00, 'strip', 25, true),

-- Capsules (should appear after tablets)
('a0000000-0000-0000-0000-000000000001', 'Vitamin E 400mg', 'Tocopherol', 'capsule', '400mg', 'Vitamin World', 8.50, 5.00, 'strip', 30, true),
('a0000000-0000-0000-0000-000000000001', 'Fish Oil 1000mg', 'Omega-3 Fatty Acids', 'capsule', '1000mg', 'Supplement Co', 12.00, 7.00, 'bottle', 20, true),

-- Syrups (should appear after tablets)
('a0000000-0000-0000-0000-000000000001', 'Paracetamol Syrup', 'Paracetamol', 'syrup', '125mg/5ml', 'Pediatric Care', 45.00, 30.00, 'bottle', 15, true),
('a0000000-0000-0000-0000-000000000001', 'Multivitamin Syrup', 'Multivitamin', 'syrup', '200ml', 'Child Health', 85.00, 60.00, 'bottle', 10, true),

-- Injections
('a0000000-0000-0000-0000-000000000001', 'Insulin Glargine', 'Insulin Glargine', 'injection', '100IU/ml', 'Diabetes Med', 450.00, 350.00, 'vial', 10, true),
('a0000000-0000-0000-0000-000000000001', 'Diclofenac Injection', 'Diclofenac Sodium', 'injection', '75mg/3ml', 'Pain Solutions', 25.00, 15.00, 'ampoule', 20, true)

ON CONFLICT (id) DO NOTHING;
