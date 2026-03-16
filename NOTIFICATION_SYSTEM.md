# 📬 Role-Based Notification System

## Overview

The HMS now includes a comprehensive, role-based notification system that ensures users only see notifications relevant to their responsibilities. Clicking on a notification automatically navigates to the relevant page and highlights the specific item.

---

## ✨ Features

### 1. **Role-Based Filtering**
Notifications are automatically filtered based on user roles:

| Role | Notifications Received |
|------|----------------------|
| **Super Admin** | All notifications (PO approvals, GRN verifications, stock adjustments, low stock alerts) |
| **Admin** | All operational notifications (PO approvals, GRN verifications, stock adjustments) |
| **Inventory Manager** | PO submissions, GRN pending verification, stock adjustments requiring approval, low stock alerts |
| **Pharmacist** | GRN pending verification, low stock alerts for medicines, expiry alerts |

### 2. **Smart Navigation**
Clicking a notification automatically:
- Marks it as read
- Navigates to the relevant page
- Passes the reference ID for highlighting/filtering

**Example Flow:**
```
Notification: "PO-2026-001 requires approval"
  ↓ Click
Navigates to: /inventory/purchase-orders
State: { referenceId: "uuid", referenceType: "purchase_order" }
  ↓ Page auto-scrolls/highlights PO-2026-001
```

### 3. **Beautiful UI**
- **Unread indicator**: Pulsing red dot on notification bell
- **Color-coded icons**: Each notification type has a unique color
- **Relative timestamps**: "2h ago", "5m ago", etc.
- **Smooth animations**: Slide-in effects, hover states
- **Responsive design**: Works on mobile and desktop

---

## 🎨 Notification Types & Icons

| Reference Type | Icon | Color | Recipients |
|---------------|------|-------|------------|
| `purchase_order` | local_shipping | Blue | Admin, Inventory Manager |
| `grn` | inventory_2 | Emerald | Admin, Pharmacist, Inventory Manager |
| `stock_adjustment` | tune | Amber | Admin, Inventory Manager |
| `cycle_count` | inventory | Purple | Inventory Manager |
| `low_stock` | warning | Red | Pharmacist, Inventory Manager |
| `expiry` | schedule | Orange | Pharmacist |
| `appointment` | event | Primary | Doctor, Receptionist |
| `prescription` | medication | Pink | Doctor, Pharmacist |

---

## 🔧 Technical Implementation

### Frontend Components

#### 1. **Notification Utils** (`utils/notificationUtils.ts`)
```typescript
getNotificationTarget(notification) // Returns { path, referenceId, referenceType }
getNotificationIcon(referenceType)  // Returns material icon name
getNotificationColor(referenceType) // Returns Tailwind color classes
formatNotificationMessage(notification) // Formats message for display
getRelativeTime(dateString) // Returns "2h ago", "5d ago", etc.
```

#### 2. **Layout Component** (`components/common/Layout.tsx`)
- Notifications dropdown in header
- Real-time unread count badge
- Click handler with navigation
- Mark as read functionality

#### 3. **Notification Service** (`services/notificationsService.ts`)
```typescript
getNotifications(page, limit, unreadOnly)
markRead(notificationId)
markAllRead()
```

### Backend API

#### Endpoints
```python
GET    /api/v1/notifications              # List notifications
PUT    /api/v1/notifications/{id}/read    # Mark as read
PUT    /api/v1/notifications/read-all     # Mark all as read
```

#### Notification Creation (Backend)
Notifications are created automatically when:
- PO status changes to `submitted` → Notifies Admin
- GRN status changes to `pending` → Notifies Admin/Pharmacist
- Stock adjustment created → Notifies Admin
- Item below reorder level → Notifies Pharmacist/Inventory Manager
- Item expiring within 30 days → Notifies Pharmacist

---

## 📱 User Experience

### Notification Bell States

**No Unread:**
```
🔔 (gray icon)
```

**Has Unread:**
```
🔔 🔴 (with pulsing red dot)
```

**Dropdown Open:**
```
┌─────────────────────────────────┐
│ 🔔 Notifications  [3]           │
│                    Mark all read │
├─────────────────────────────────┤
│ 📦 PO-2026-001 requires approval│
│    Purchase Order needs...       │
│    🕐 2h ago                     │
├─────────────────────────────────┤
│ 📦 GRN-2026-045 needs verification
│    Goods Receipt pending...      │
│    🕐 5h ago                     │
└─────────────────────────────────┘
```

---

## 🎯 Navigation Targets

When a notification is clicked, the user is navigated to:

| Reference Type | Target Path | Page Behavior |
|---------------|-------------|---------------|
| `purchase_order` | `/inventory/purchase-orders` | Opens detail modal for PO |
| `grn` | `/inventory/grns` | Opens detail modal for GRN |
| `stock_adjustment` | `/inventory/adjustments` | Highlights adjustment |
| `cycle_count` | `/inventory/cycle-counts` | Opens count details |
| `supplier` | `/inventory/suppliers` | Opens supplier card |
| `appointment` | `/appointments/manage` | Highlights appointment |
| `prescription` | `/prescriptions` | Opens prescription |

---

## 🔒 Role-Based Access Control

### Notification Visibility

```typescript
// Example: PO Submission Notification
{
  reference_type: 'purchase_order',
  reference_id: 'uuid',
  user_id: 'admin_user_uuid',  // Only admin sees it
  hospital_id: 'hospital_uuid',
  type: 'approval_required',
  priority: 'high'
}
```

### Permission Matrix

| Action | Super Admin | Admin | Inventory Manager | Pharmacist |
|--------|-------------|-------|-------------------|------------|
| Create PO | ✅ | ✅ | ✅ | ❌ |
| Approve PO | ✅ | ✅ | ❌ | ❌ |
| Submit GRN | ✅ | ✅ | ✅ | ✅ |
| Verify GRN | ✅ | ✅ | ✅ | ✅ |
| Approve Stock Adjustment | ✅ | ✅ | ❌ | ❌ |
| Receive Low Stock Alert | ✅ | ✅ | ✅ | ✅ |
| Receive Expiry Alert | ✅ | ✅ | ✅ | ✅ |

---

## 🛠️ How to Use

### For Developers

#### Creating a Notification (Backend)
```python
from ..models.notification import Notification

def create_notification(db, user_id, hospital_id, reference_type, reference_id, title, message):
    notification = Notification(
        user_id=user_id,
        hospital_id=hospital_id,
        reference_type=reference_type,
        reference_id=reference_id,
        title=title,
        message=message,
        type='info',
        priority='normal'
    )
    db.add(notification)
    db.commit()
    return notification
```

#### Handling Navigation (Frontend)
```typescript
// Page receives navigation state
const location = useLocation();
const { fromNotification, referenceId, referenceType } = location.state || {};

// Auto-open detail modal if from notification
useEffect(() => {
  if (fromNotification && referenceId) {
    // Fetch and open the specific item
    fetchItem(referenceId).then(item => {
      setDetailItem(item);
      // Optional: highlight the item
    });
  }
}, [fromNotification, referenceId]);
```

---

## 📊 Analytics & Metrics

Track notification effectiveness:
- **Open Rate**: % of notifications clicked
- **Response Time**: Time from notification to action
- **Unread Count**: Average unread notifications per user
- **Peak Times**: When most notifications are received

---

## 🎨 Customization

### Adding New Notification Types

1. **Add to `notificationUtils.ts`:**
```typescript
const icons: Record<string, string> = {
  // ... existing
  new_type: 'icon_name',
};

const colors: Record<string, string> = {
  // ... existing
  new_type: 'text-color bg-color',
};
```

2. **Create notification in backend service**
3. **Update this documentation**

---

## 🐛 Troubleshooting

### Issue: Notifications not showing
**Solution:** Check that user has proper roles assigned

### Issue: Click doesn't navigate
**Solution:** Verify `getNotificationTarget` returns correct path

### Issue: Wrong users receiving notifications
**Solution:** Check notification creation logic for proper user_id assignment

---

## 📝 Best Practices

1. **Keep messages concise** - Use title for main info, message for details
2. **Use appropriate priority** - `high` for urgent, `normal` for routine
3. **Group related notifications** - Don't spam with multiple similar notifications
4. **Clear context** - Include enough info to understand without clicking
5. **Respect roles** - Only send notifications users can act upon

---

## 🔮 Future Enhancements

- [ ] Push notifications (WebSocket)
- [ ] Email digest of notifications
- [ ] SMS for critical alerts
- [ ] Notification preferences per user
- [ ] Scheduled notifications summary
- [ ] Notification templates
- [ ] Bulk actions (mark multiple as read)
- [ ] Search in notifications
- [ ] Filter by type/date

---

## 📚 Related Files

- `frontend/src/utils/notificationUtils.ts` - Utility functions
- `frontend/src/components/common/Layout.tsx` - Notification dropdown UI
- `frontend/src/services/notificationsService.ts` - API client
- `backend/app/routers/notifications.py` - API endpoints
- `backend/app/models/notification.py` - Database model
- `frontend/src/pages/inventory/PurchaseOrdersPage.tsx` - Example target page
- `frontend/src/pages/inventory/GRNsPage.tsx` - Example target page

---

**Last Updated:** 2026-03-17  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
