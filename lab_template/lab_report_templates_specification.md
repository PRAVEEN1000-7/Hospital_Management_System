# Lab Report Template Specifications

Complete documentation for all 10 lab report templates to recreate in any application/framework.

---

## Template 1: Haemogram / Complete Blood Count

### Source Image
IMG-20260719-WA0015.jpg

### Report Category
Haematology — Complete Blood Count (CBC)

### Blood Group
- **Group:** B
- **RH Type:** Positive

### Data Table

| Test | Result | Units | Normal Range | Status |
|------|--------|-------|-------------|--------|
| Haemoglobin | 9.1 | GMS% | 13 to 17 | LOW |
| Total Count (WBC) | 6900 | Cells/Cumm | 4000 to 10000 | NORMAL |
| Neutrophil | 51.8 | % | 40 to 70 | NORMAL |
| Lymphocyte | 40.7 | % | 20 to 50 | NORMAL |
| Eosinophil | 3 | % | 01 to 06 | NORMAL |
| Monocyte | 4.5 | % | 02 to 10 | NORMAL |
| Basophil | 0 | % | 00 to 01 | NORMAL |
| ESR | 12 | mm/hr | 0 to 30 | NORMAL |
| RBC | 4.35 | million/cumm | 4.5 to 6.00 | LOW |
| HCT | 28.1 | % | 40 to 54 | LOW |
| MCV | 64.7 | fl | 80 to 96 | LOW |
| MCH | 20.9 | pg | 27 to 32 | LOW |
| MCHC | 32.3 | % | 32 to 36 | NORMAL |
| Platelet Count | 4.55 L | Cells/Cumm | 1.4 to 4.0 | HIGH |

### Key Abnormalities
- Haemoglobin severely low (9.1 vs 13-17) — indicates anaemia
- RBC low (4.35 vs 4.5-6.0)
- HCT low (28.1 vs 40-54)
- MCV low (64.7 vs 80-96) — microcytic anaemia indicator
- MCH low (20.9 vs 27-32)
- Platelet count high (4.55L vs 1.4-4.0)

### UI Structure
- Card container with header (title + subtitle)
- Section dividers: "Complete Blood Count", "Differential Count", "Other Parameters"
- 4-column grid: Test | Result | Units | Normal Range
- Blood group displayed as highlight banner at bottom
- Color coding: LOW=blue, HIGH=red, NORMAL=green

---

## Template 2: Biochemistry — Electrolytes & Renal Profile

### Source Image
IMG-20260719-WA0016.jpg

### Report Category
Biochemistry

### Section 1: Electrolytes

| Test | Result | Units | Ref. Range | Status |
|------|--------|-------|-----------|--------|
| Sodium | 144.5 | mmol/L | 136 - 145 | NORMAL |
| Potassium | 4 | mmol/L | 3.5 - 5.1 | NORMAL |
| Chloride | 107.3 | mmol/L | 98 - 107 | HIGH |
| Bicarbonate | 26.1 | mmol/L | 23 - 30 | NORMAL |

### Section 2: Renal Profile

| Test | Result | Units | Ref. Range | Status |
|------|--------|-------|-----------|--------|
| Blood Urea | 33.9 | ng/ml | 10 to 40 | NORMAL |
| Serum Creatinine | 0.8 | ug/dl | 0.7 to 1.4 | NORMAL |
| Uric Acid | 5.8 | Uiu/ml | 3.4 to 7.0 | NORMAL |
| Calcium | 8.4 | mg/dl | 8.5 to 11 | LOW |

### Key Abnormalities
- Chloride at upper limit (107.3 vs 98-107) — borderline high
- Calcium slightly low (8.4 vs 8.5-11)

### UI Structure
- Card with header
- Two section titles: "Electrolytes" and "Renal Profile"
- 4-column grid per section
- Section separators with background color

---

## Template 3: Microbiology — C/S Urine

### Source Image
IMG-20260719-WA0018.jpg

### Report Category
Microbiology — Culture & Sensitivity (Urine)

### Test Results

| Test | Result |
|------|--------|
| **Microscopy** | Scanty pus cells, scanty epithelial cells, and scanty Gram negative bacilli were seen |
| **Culture** | No growth in culture |

### Notes
- Culture Sterile
- Gram negative bacilli seen on microscopy but no culture growth

### UI Structure
- Card with header
- Two result blocks with left border accent
- Microscopy block: accent color (blue)
- Culture block: green accent (negative result)
- Note box at bottom (warning/alert style)

---

## Template 4: Diabetic Profile & PSA

### Source Image
IMG-20260719-WA0020.jpg

### Report Categories
Biochemistry (Diabetic Profile) + Immunology (PSA)

### Section 1: Diabetic Profile

| Test | Result | Units | Ref. Range | Status |
|------|--------|-------|-----------|--------|
| HbA1c | 5.12 | % | 4.00 - 5.60 | NORMAL |
| Estimated Average Glucose (eAG) | 148 | mg/dl | 80 - 120 | HIGH |

### Section 2: Immunology — PSA

| Test | Result | Units | Status |
|------|--------|-------|--------|
| PSA (Rechecked) | 9.20 | ng/ml | HIGH |

### Age-Based PSA Reference Ranges

| Age Group | Upper Limit |
|-----------|------------|
| < 40 Years | 1.4 |
| 40 - 49 | 2.0 |
| 50 - 59 | 3.1 |
| 60 - 69 | 4.1 |
| > 70 Years | 4.4 |

### Key Abnormalities
- eAG high (148 vs 80-120)
- PSA critically elevated (9.20) — significantly above all age-based ranges

### UI Structure
- Card with header
- Standard table for Diabetic Profile
- Highlighted banner for PSA result (red/danger style)
- Age reference table below PSA

---

## Template 5: Bleeding Time & Clotting Time

### Source Image
IMG-20260719-WA0021.jpg

### Report Category
Haematology

### Test Results

| Test | Result | Units | Ref. Range | Status |
|------|--------|-------|-----------|--------|
| Bleeding Time | 1.41 | Min. | 1 to 3 | NORMAL |
| Clotting Time | 9.5 | Min. | 3 to 8 | HIGH |

### Key Abnormalities
- Clotting time elevated (9.5 vs 3-8 min)

### UI Structure
- Card with header
- Two side-by-side test cards (grid layout)
- Bleeding Time card: green gradient background
- Clotting Time card: red gradient background
- Large numeric display for values
- "End of Report" footer

---

## Template 6: RA Factor

### Source Image
IMG-20260719-WA0028.jpg

### Report Category
Serology

### Test Results

| Test | Result | Units | Ref. Range | Status |
|------|--------|-------|-----------|--------|
| RA Factor | 11 | IU/ml | Less than 14 | NORMAL |

### UI Structure
- Card with header
- Large highlight box with result
- Left side: Test name + "Normal" status badge
- Right side: Large numeric value + unit
- Reference range box below

---

## Template 7: Liver Function & Thyroid Profile

### Source Image
IMG-20260719-WA0029.jpg

### Report Category
Biochemistry

### Section 1: Liver Function Profile

| Test | Result | Units | Normal Range | Status |
|------|--------|-------|-------------|--------|
| Bilirubin Total | 0.6 | mg/dl | 0.2 to 1.2 | NORMAL |
| Bilirubin Direct | 0.5 | mg/dl | 0.0 to 0.2 | HIGH |
| Bilirubin Indirect | 0.4 | mg/dl | 0.1 to 0.5 | NORMAL |
| SGOT (AST) | 31.21 | U/L | 8 to 40 | NORMAL |
| SGPT (ALT) | 33.65 | U/L | 5 to 40 | NORMAL |
| Alkaline Phosphatase | 110 | U/L | 42 to 130 | NORMAL |
| GGT | 48 | U/L | 0 to 115 | NORMAL |
| Total Protein | 5.21 | g/dl | 6.4 to 7.8 | LOW |
| Albumin | 4.11 | g/dl | 3.5 to 5.2 | NORMAL |
| A/G Ratio | 1.31 | Ratio | 0.9 to 2.0 | NORMAL |

### Section 2: Thyroid Profile

| Test | Result | Units | Normal Range | Status |
|------|--------|-------|-------------|--------|
| Serum T3 | 1.77 | ng/ml | 0.80 to 2.00 | NORMAL |
| Serum T4 | 14.06 | ug/dl | 4.1 to 12.1 | NORMAL |
| TSH | 3.37 | uLU/ml | 0.30 to 5.5 | NORMAL |

### Key Abnormalities
- Bilirubin Direct elevated (0.5 vs 0.0-0.2)
- Total Protein low (5.21 vs 6.4-7.8)

### UI Structure
- Card with header
- Two section titles
- Standard 4-column table per section

---

## Template 8: Serology — Infectious Disease Panel

### Source Image
IMG-20260719-WA0031.jpg

### Report Category
Serology

### Test Results

| Test | Result | Units | Method/Ref Range |
|------|--------|-------|-----------------|
| Anti HIV Ag/Ab Combo | 0.342 (Nonreactive) | COI | <0.9: Non Reactive; >=1.0: Reactive (ECLIA) |
| VDRL (Syphilis Ab) | NONREACTIVE | — | Non Reactive (Chromatographic Lateral Flow) |
| HBs Ag | 0.52 (Nonreactive) | COI | <0.9: Non Reactive; >=1.0: Reactive (ECLIA) |
| HBe Ag | 0.40 (Nonreactive) | — | Non Reactive: <1.0; Reactive: >=1.0 |
| Anti HCV | 0.08 (Nonreactive) | — | <0.9: Non Reactive; >=1.0: Reactive (ECLIA) |
| CRP | 0.8 | mg/L | Less than 5.0 |

### Key Findings
- All infectious markers nonreactive (negative)
- CRP normal (0.8 < 5.0)

### UI Structure
- Card with header
- Table with 4 columns: Test | Result | Units | Ref Range/Method
- Status badges ("Nonreactive" in green)
- CRP displayed as highlight banner at bottom

---

## Template 9: Urine Complete

### Source Image
IMG-20260719-WA0033.jpg

### Report Category
Urine Analysis — Complete

### Physical & Chemical Examination

| Parameter | Result |
|-----------|--------|
| Colour | Yellow |
| Appearance | Clear |
| Reaction (pH) | 1.005 |
| Specific Gravity | Negative |
| Nitrite | Negative |
| Leukocytes | Negative |
| Blood | Negative |
| Ketone | Negative |
| Albumin | Nil |
| Sugar | ++++ (4+) |
| Bile Salt | Nil |
| Bile Pigment | Nil |
| Urobilinogen | Nil |

### Microscopic Examination

| Parameter | Result |
|-----------|--------|
| Pus Cells | 2 to 4 |
| RBC | Nil |
| Epithelial Cells | 2 to 4 |

### Key Abnormalities
- Sugar: ++++ (strongly positive) — indicates glucosuria

### UI Structure
- Card with header
- Two-column layout: Parameter | Result
- Section title for Physical/Chemical
- Microscopic section with subtle background
- Color swatch for urine colour
- Positive results highlighted in red

---

## Template 10: Malaria, Widal & Dengue

### Source Image
IMG-20260719-WA0034.jpg

### Report Categories
Haematology + Serology

### Section 1: Haematology — Malarial Parasite

| Test | Result |
|------|--------|
| Malarial Parasite (Slide) | Not found in the smear examined |

### Section 2: Serology — Widal Slide Method

| Antigen | Result | Significant Titer |
|---------|--------|------------------|
| Typhi "O" | Negative 1:20 dl | >= 1:80 (Slide agglutination) |
| Typhi "H" | Negative 1:20 dl | >= 1:80 (Slide agglutination) |
| Typhi "AH" | Negative 1:20 dl | >= 1:80 (Slide agglutination) |
| Typhi "BH" | Negative 1:20 dl | >= 1:80 (Slide agglutination) |

### Section 3: Serology — Dengue

| Test | Result | Status | Interpretation |
|------|--------|--------|---------------|
| Dengue NS1 Antigen | 2.37 | Negative | <9: Negative; 9.0-11.0: Equivocal; >11: Positive (ELISA) |

### Key Findings
- No malarial parasites detected
- All Widal titers negative (below significant threshold of 1:80)
- Dengue NS1 antigen negative

### UI Structure
- Card with header
- Three section titles
- Malaria: result block with green left border
- Widal: 3-column table (Antigen | Result | Significant Titer)
- Dengue: highlight banner with large value + status badge + interpretation text

---

## Global Design System

### Color Palette
| Token | Hex | Usage |
|-------|-----|-------|
| Background | #f8fafc | Page background |
| Card Background | #ffffff | Card/container |
| Text Primary | #1e293b | Headings, primary text |
| Text Secondary | #64748b | Subtitles, units |
| Text Muted | #94a3b8 | Labels, metadata |
| Border | #e2e8f0 | Dividers, borders |
| Danger/High | #ef4444 | Abnormal high values |
| Success/Normal | #22c55e | Normal values |
| Accent/Low | #3b82f6 | Abnormal low values |
| Warning | #f59e0b | Alerts, notes |

### Typography
- Font: 'Segoe UI', system-ui, -apple-system, sans-serif
- Report Title: 22px, weight 600
- Report Subtitle: 13px, weight 400, uppercase, letter-spacing 0.5px
- Section Title: 12px, weight 600, uppercase, letter-spacing 0.8px
- Table Header: 11px, weight 600, uppercase, letter-spacing 0.5px
- Body Text: 14px, weight 400
- Large Values: 28-42px, weight 700

### Spacing Scale
- Card padding: 24px 28px
- Section padding: 16px 28px
- Row padding: 10-14px vertical
- Grid gap: 20px
- Border radius: Card 16px, Buttons/Badges 20px, Inner cards 10-12px

### Common Components
1. **Report Card**: White background, 16px radius, subtle shadow
2. **Section Title**: Full-width bar with light background (#f1f5f9)
3. **Table Row**: 4-column grid (Test | Result | Units | Range)
4. **Status Badge**: Pill-shaped, colored by status
5. **Highlight Box**: Gradient background for critical results
6. **Note Box**: Warning-style container for additional notes

### Responsive Behavior
- Max-width: 700px, centered
- Mobile: Stack columns, reduce padding
- Grid adapts to single column on small screens
