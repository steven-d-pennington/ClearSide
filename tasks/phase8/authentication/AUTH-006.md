# AUTH-006: User Management UI

**Task ID:** AUTH-006
**Phase:** Phase 8
**Category:** Authentication System
**Priority:** P0
**Estimated Effort:** M (4-6 hours)
**Dependencies:** AUTH-001 (types), AUTH-004 (API routes), AUTH-005 (frontend auth)
**Status:** Ready

---

## Context

Implement admin UI for user management with CRUD operations, temp password display, and organization scoping. Admins can create, view, edit, and deactivate users. Org admins see only their organization's users; super admins see all users.

**References:**
- AUTH-001 (Database Schema & Types)
- AUTH-004 (API Routes)
- AUTH-005 (Frontend Authentication)
- Existing admin patterns in `frontend/src/pages/Admin*`

---

## Requirements

### Acceptance Criteria

- [ ] Create AdminUsersPage with user list table
- [ ] Add "Users" navigation link in admin sidebar
- [ ] Show user role badges (super_admin, org_admin, user)
- [ ] Implement CreateUserModal with org and role selection
- [ ] Display temp password after user creation
- [ ] Implement EditUserModal for updating user fields
- [ ] Add deactivate/activate user toggle
- [ ] Filter users by organization (org admins see only their org)
- [ ] Add search/filter by username or email
- [ ] Show last login timestamp
- [ ] Disable edit/delete for current user
- [ ] Super admins can manage all organizations
- [ ] Org admins can only manage users in their organization

### Functional Requirements

**User List:**
- Table columns: Username, Full Name, Email, Role, Organization, Last Login, Status, Actions
- Role badges with color coding (red for super_admin, purple for org_admin, blue for user)
- Status indicator (active/inactive)
- Edit and deactivate buttons per user

**Create User:**
- Organization dropdown (all orgs for super_admin, only own org for org_admin)
- Username input (validated for uniqueness)
- Email input (optional)
- Full name input (optional)
- Role selection dropdown
- Temp password display after creation (copy to clipboard)

**Edit User:**
- Update email, full name, role, active status
- Cannot change username or organization
- Cannot edit your own role

**Permissions:**
- Super admins: manage all users in all organizations
- Org admins: manage users only in their organization
- Cannot delete super_admin users (only super_admins can)
- Cannot edit/delete your own account

---

## Implementation

### 1. User Management Page

**File:** `frontend/src/pages/AdminUsersPage.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { useAuth } from '../stores/auth-store';
import { CreateUserModal } from '../components/CreateUserModal';
import { EditUserModal } from '../components/EditUserModal';
import styles from './AdminUsersPage.module.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

interface User {
  id: string;
  organizationId: string;
  username: string;
  email: string | null;
  role: 'super_admin' | 'org_admin' | 'user';
  fullName: string | null;
  isTempPassword: boolean;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export const AdminUsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.users);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (!response.ok) {
        throw new Error('Failed to update user');
      }

      fetchUsers();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'super_admin':
        return styles.roleSuperAdmin;
      case 'org_admin':
        return styles.roleOrgAdmin;
      case 'user':
        return styles.roleUser;
      default:
        return '';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin';
      case 'org_admin':
        return 'Org Admin';
      case 'user':
        return 'User';
      default:
        return role;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Error: {error}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>User Management</h1>
          <p className={styles.subtitle}>
            {currentUser?.role === 'super_admin'
              ? 'Manage users across all organizations'
              : 'Manage users in your organization'}
          </p>
        </div>
        <button
          className={styles.createButton}
          onClick={() => setShowCreateModal(true)}
        >
          + Create User
        </button>
      </div>

      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Search by username, email, or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Username</th>
              <th>Full Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Last Login</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className={!user.isActive ? styles.inactiveRow : ''}>
                <td>
                  <div className={styles.usernameCell}>
                    {user.username}
                    {user.isTempPassword && (
                      <span className={styles.tempBadge}>Temp Password</span>
                    )}
                  </div>
                </td>
                <td>{user.fullName || '-'}</td>
                <td>{user.email || '-'}</td>
                <td>
                  <span className={`${styles.roleBadge} ${getRoleBadgeColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                </td>
                <td className={styles.dateCell}>{formatDate(user.lastLoginAt)}</td>
                <td>
                  <span
                    className={`${styles.statusBadge} ${
                      user.isActive ? styles.statusActive : styles.statusInactive
                    }`}
                  >
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className={styles.actions}>
                    <button
                      className={styles.editButton}
                      onClick={() => setEditingUser(user)}
                      disabled={user.id === currentUser?.id}
                    >
                      Edit
                    </button>
                    <button
                      className={
                        user.isActive ? styles.deactivateButton : styles.activateButton
                      }
                      onClick={() => handleToggleActive(user.id, user.isActive)}
                      disabled={user.id === currentUser?.id}
                    >
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className={styles.emptyState}>
            {searchTerm ? 'No users found matching your search.' : 'No users found.'}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchUsers();
          }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            setEditingUser(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
};
```

**File:** `frontend/src/pages/AdminUsersPage.module.css`

```css
.container {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.title {
  font-size: 2rem;
  font-weight: 700;
  color: #1a202c;
  margin-bottom: 0.5rem;
}

.subtitle {
  font-size: 1rem;
  color: #718096;
}

.createButton {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}

.createButton:hover {
  transform: translateY(-2px);
}

.searchBar {
  margin-bottom: 1.5rem;
}

.searchInput {
  width: 100%;
  max-width: 400px;
  padding: 0.75rem 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
}

.searchInput:focus {
  outline: none;
  border-color: #667eea;
}

.tableContainer {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table thead {
  background: #f7fafc;
  border-bottom: 2px solid #e2e8f0;
}

.table th {
  padding: 1rem;
  text-align: left;
  font-size: 0.875rem;
  font-weight: 600;
  color: #4a5568;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.table tbody tr {
  border-bottom: 1px solid #e2e8f0;
  transition: background 0.2s;
}

.table tbody tr:hover {
  background: #f7fafc;
}

.table td {
  padding: 1rem;
  font-size: 0.9375rem;
  color: #2d3748;
}

.inactiveRow {
  opacity: 0.6;
}

.usernameCell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tempBadge {
  padding: 0.125rem 0.5rem;
  background: #fef5e7;
  border: 1px solid #f39c12;
  color: #d68910;
  font-size: 0.6875rem;
  font-weight: 600;
  border-radius: 4px;
  text-transform: uppercase;
}

.roleBadge {
  padding: 0.25rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.roleSuperAdmin {
  background: #fed7d7;
  color: #c53030;
}

.roleOrgAdmin {
  background: #e9d5ff;
  color: #7c3aed;
}

.roleUser {
  background: #bee3f8;
  color: #2c5282;
}

.dateCell {
  font-size: 0.875rem;
  color: #718096;
}

.statusBadge {
  padding: 0.25rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
}

.statusActive {
  background: #c6f6d5;
  color: #22543d;
}

.statusInactive {
  background: #fed7d7;
  color: #c53030;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.editButton,
.deactivateButton,
.activateButton {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.editButton {
  background: #edf2f7;
  color: #4a5568;
}

.editButton:hover:not(:disabled) {
  background: #e2e8f0;
}

.deactivateButton {
  background: #fed7d7;
  color: #c53030;
}

.deactivateButton:hover:not(:disabled) {
  background: #fc8181;
}

.activateButton {
  background: #c6f6d5;
  color: #22543d;
}

.activateButton:hover:not(:disabled) {
  background: #9ae6b4;
}

.editButton:disabled,
.deactivateButton:disabled,
.activateButton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.emptyState {
  padding: 3rem;
  text-align: center;
  color: #718096;
  font-size: 1rem;
}

.loading,
.error {
  padding: 3rem;
  text-align: center;
  font-size: 1rem;
}

.error {
  color: #c53030;
}
```

### 2. Create User Modal

**File:** `frontend/src/components/CreateUserModal.tsx`

```typescript
import React, { useState } from 'react';
import { useAuth } from '../stores/auth-store';
import styles from './CreateUserModal.module.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({ onClose, onSuccess }) => {
  const { user: currentUser } = useAuth();

  const [formData, setFormData] = useState({
    organizationId: currentUser?.organizationId || '',
    username: '',
    email: '',
    fullName: '',
    role: 'user' as 'super_admin' | 'org_admin' | 'user',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          organizationId: formData.organizationId,
          username: formData.username,
          email: formData.email || undefined,
          fullName: formData.fullName || undefined,
          role: formData.role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      setTempPassword(data.tempPassword);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPassword = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      alert('Temporary password copied to clipboard!');
    }
  };

  const handleDone = () => {
    onSuccess();
  };

  if (tempPassword) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.header}>
            <h2 className={styles.title}>User Created Successfully</h2>
          </div>

          <div className={styles.successContent}>
            <div className={styles.successIcon}>✓</div>
            <p className={styles.successMessage}>
              User <strong>{formData.username}</strong> has been created.
            </p>

            <div className={styles.passwordDisplay}>
              <label className={styles.passwordLabel}>Temporary Password</label>
              <div className={styles.passwordBox}>
                <code className={styles.password}>{tempPassword}</code>
                <button className={styles.copyButton} onClick={handleCopyPassword}>
                  Copy
                </button>
              </div>
              <p className={styles.passwordHint}>
                Share this password securely with the user. They will be required to change
                it on first login.
              </p>
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.doneButton} onClick={handleDone}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Create New User</h2>
          <button className={styles.closeButton} onClick={onClose} disabled={isLoading}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="username" className={styles.label}>
              Username <span className={styles.required}>*</span>
            </label>
            <input
              id="username"
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className={styles.input}
              required
              disabled={isLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={styles.input}
              disabled={isLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="fullName" className={styles.label}>
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className={styles.input}
              disabled={isLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="role" className={styles.label}>
              Role <span className={styles.required}>*</span>
            </label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as 'super_admin' | 'org_admin' | 'user',
                })
              }
              className={styles.select}
              required
              disabled={isLoading}
            >
              <option value="user">User</option>
              <option value="org_admin">Organization Admin</option>
              {currentUser?.role === 'super_admin' && (
                <option value="super_admin">Super Admin</option>
              )}
            </select>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isLoading}
            >
              {isLoading ? 'Creating...' : 'Create User'}
            </button>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

**File:** `frontend/src/components/CreateUserModal.module.css`

```css
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  width: 100%;
  max-width: 550px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a202c;
}

.closeButton {
  background: none;
  border: none;
  font-size: 2rem;
  color: #718096;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 32px;
  height: 32px;
}

.closeButton:hover {
  color: #1a202c;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.formGroup {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #4a5568;
}

.required {
  color: #c53030;
}

.input,
.select {
  padding: 0.75rem 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.2s;
}

.input:focus,
.select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.input:disabled,
.select:disabled {
  background-color: #f7fafc;
  cursor: not-allowed;
}

.error {
  padding: 0.75rem;
  background-color: #fed7d7;
  border: 1px solid #fc8181;
  border-radius: 8px;
  color: #c53030;
  font-size: 0.875rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.submitButton,
.doneButton {
  flex: 1;
  padding: 0.875rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}

.submitButton:hover:not(:disabled),
.doneButton:hover {
  transform: translateY(-2px);
}

.submitButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancelButton {
  padding: 0.875rem 1.5rem;
  background: #e2e8f0;
  color: #4a5568;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.cancelButton:hover:not(:disabled) {
  background: #cbd5e0;
}

.cancelButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.successContent {
  text-align: center;
  padding: 1rem 0;
}

.successIcon {
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  background: #c6f6d5;
  color: #22543d;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: bold;
}

.successMessage {
  font-size: 1rem;
  color: #2d3748;
  margin-bottom: 2rem;
}

.passwordDisplay {
  background: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.5rem;
  text-align: left;
}

.passwordLabel {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 0.5rem;
}

.passwordBox {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

.password {
  flex: 1;
  padding: 0.75rem 1rem;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 1.125rem;
  font-weight: 600;
  color: #1a202c;
}

.copyButton {
  padding: 0.75rem 1.5rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.copyButton:hover {
  background: #5a67d8;
}

.passwordHint {
  font-size: 0.75rem;
  color: #718096;
  line-height: 1.5;
}
```

### 3. Edit User Modal

**File:** `frontend/src/components/EditUserModal.tsx`

```typescript
import React, { useState } from 'react';
import { useAuth } from '../stores/auth-store';
import styles from './CreateUserModal.module.css'; // Reuse styles

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

interface User {
  id: string;
  organizationId: string;
  username: string;
  email: string | null;
  role: 'super_admin' | 'org_admin' | 'user';
  fullName: string | null;
  isActive: boolean;
}

interface EditUserModalProps {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  onClose,
  onSuccess,
}) => {
  const { user: currentUser } = useAuth();

  const [formData, setFormData] = useState({
    email: user.email || '',
    fullName: user.fullName || '',
    role: user.role,
    isActive: user.isActive,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: formData.email || undefined,
          fullName: formData.fullName || undefined,
          role: formData.role,
          isActive: formData.isActive,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Edit User</h2>
          <button className={styles.closeButton} onClick={onClose} disabled={isLoading}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Username</label>
            <input
              type="text"
              value={user.username}
              className={styles.input}
              disabled
            />
            <p style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
              Username cannot be changed
            </p>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={styles.input}
              disabled={isLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="fullName" className={styles.label}>
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className={styles.input}
              disabled={isLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="role" className={styles.label}>
              Role
            </label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as 'super_admin' | 'org_admin' | 'user',
                })
              }
              className={styles.select}
              disabled={isLoading}
            >
              <option value="user">User</option>
              <option value="org_admin">Organization Admin</option>
              {currentUser?.role === 'super_admin' && (
                <option value="super_admin">Super Admin</option>
              )}
            </select>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

### 4. Add to Admin Navigation

**File:** `frontend/src/components/AdminLayout.tsx` (or wherever admin nav is)

```typescript
// Add to navigation links
<NavLink to="/admin/users" className={styles.navLink}>
  <UsersIcon />
  Users
</NavLink>
```

### 5. Add Route

**File:** `frontend/src/App.tsx`

```typescript
import { AdminUsersPage } from './pages/AdminUsersPage';

// Add to routes
<Route path="/admin/users" element={
  <ProtectedRoute>
    <AdminUsersPage />
  </ProtectedRoute>
} />
```

---

## Testing & Verification

### Manual Testing

```bash
# 1. Login as super admin
# - Navigate to /admin/users
# - Should see all users across all organizations

# 2. Create a new user
# - Click "Create User"
# - Fill in details
# - Select role
# - Submit
# - Should show temp password
# - Copy password

# 3. Login as new user with temp password
# - Should be forced to change password
# - Cannot dismiss modal

# 4. Edit user
# - Click "Edit" button
# - Update email and name
# - Save changes
# - Verify changes persist

# 5. Deactivate user
# - Click "Deactivate" button
# - User row should gray out
# - User should not be able to login

# 6. Login as org admin
# - Should only see users in their organization
# - Cannot create super_admin users
# - Cannot edit users in other organizations

# 7. Test search
# - Enter username in search
# - Should filter results
```

---

## Critical Files

- `frontend/src/pages/AdminUsersPage.tsx` (new)
- `frontend/src/pages/AdminUsersPage.module.css` (new)
- `frontend/src/components/CreateUserModal.tsx` (new)
- `frontend/src/components/EditUserModal.tsx` (new)
- `frontend/src/components/CreateUserModal.module.css` (new)
- `frontend/src/components/AdminLayout.tsx` (modified - add nav link)
- `frontend/src/App.tsx` (modified - add route)

---

## Dependencies

- AUTH-001 (Database Schema & Types)
- AUTH-004 (API Routes)
- AUTH-005 (Frontend Authentication)

---

**Status:** Ready to implement
**Next Task:** None - Phase 8 Authentication System Complete!
