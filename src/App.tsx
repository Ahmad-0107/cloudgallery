import { useCallback, useEffect, useMemo, useState } from 'react';
import { Hub } from 'aws-amplify/utils';
import { getCurrentUser, fetchAuthSession, signInWithRedirect, signOut } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { get } from 'aws-amplify/api';
import { uploadData, getUrl, remove } from 'aws-amplify/storage';
import type { Schema } from '../amplify/data/resource';

const client = generateClient<Schema>();
type Photo = Schema['Photo']['type'] & { url?: string };
type Me = { email?: string; groups?: string[]; sub?: string; username?: string };
type AuthUser = { userId: string; username: string };

function formatDate(iso?: string | null) {
  if (!iso) return 'Just now';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Landing() {
  return (
    <div className="landing">
      <span className="pill">
        <span className="pill-dot" />
        Serverless Cloud Architecture &middot; AWS Amplify Gen 2
      </span>
      <h1>
        Your moments,
        <br />
        <span className="grad">beautifully shared.</span>
      </h1>
      <p>
        A private-by-default cloud photo gallery powered by Amazon Cognito, S3, and AppSync. Sign in
        once, upload in seconds, and manage your collection anywhere.
      </p>
      <button className="btn big" onClick={() => signInWithRedirect({ provider: 'Google' })}>
        <svg width="19" height="19" viewBox="0 0 48 48">
          <path
            fill="#EA4335"
            d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6C12.3 13.5 17.7 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z"
          />
          <path
            fill="#FBBC05"
            d="M10.4 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.8-6C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.6l7.8-6z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.2 0 11.7-2 15.6-5.6l-7.5-5.8c-2.1 1.4-4.8 2.3-8.1 2.3-6.3 0-11.7-4-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"
          />
        </svg>
        Continue with Google
      </button>

      <div className="feature-strip">
        <div className="feature-item">
          <strong>Google OAuth + Cognito</strong>
          <span>Federated identity with role-based Member and Admin access groups.</span>
        </div>
        <div className="feature-item">
          <strong>Scoped Amazon S3</strong>
          <span>Identity-isolated object prefixes with pre-signed URL delivery.</span>
        </div>
        <div className="feature-item">
          <strong>AppSync &amp; DynamoDB</strong>
          <span>Real-time GraphQL metadata persistence with owner-enforced rules.</span>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ user }: { user: AuthUser }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [me, setMe] = useState<Me>({});
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [open, setOpen] = useState<Photo | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);

  const notify = useCallback((text: string, err = false) => {
    setToast({ text, err });
    setTimeout(() => setToast(null), 3400);
  }, []);

  const isAdmin = Boolean(me.groups?.includes('Admins'));

  const displayRole = useMemo(() => {
    if (isAdmin) return 'Admins';
    const named = me.groups?.find((g) => g === 'Users' || !g.endsWith('_Google'));
    return named ?? 'Users';
  }, [isAdmin, me.groups]);

  const ownerIds = useMemo(() => {
    return [user.userId, user.username, me.sub, me.username].filter((v): v is string => Boolean(v));
  }, [user.userId, user.username, me.sub, me.username]);

  const isMine = useCallback(
    (p: Photo) => {
      if (!p.owner) return false;
      return ownerIds.some(
        (id) => p.owner === id || p.owner!.startsWith(`${id}::`) || p.owner!.endsWith(`::${id}`),
      );
    },
    [ownerIds],
  );

  const canDelete = useCallback((p: Photo) => isAdmin || isMine(p), [isAdmin, isMine]);

  const load = useCallback(async () => {
    const { data } = await client.models.Photo.list();
    const sorted = [...data].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    setPhotos(
      await Promise.all(
        sorted.map(async (p) => ({ ...p, url: (await getUrl({ path: p.s3Key })).url.toString() })),
      ),
    );
  }, []);

  useEffect(() => {
    load().catch((err) => {
      console.error(err);
      notify('Failed to load gallery photos.', true);
    });
    (async () => {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString() ?? '';
      const payload = session.tokens?.idToken?.payload;
      const res = await get({
        apiName: 'cloudgalleryRest',
        path: 'whoami',
        options: { headers: { Authorization: token } },
      }).response;
      const data = (await res.body.json()) as Me;
      setMe({
        ...data,
        sub: typeof payload?.sub === 'string' ? payload.sub : undefined,
        username:
          typeof payload?.['cognito:username'] === 'string'
            ? payload['cognito:username']
            : undefined,
      });
    })().catch(console.error);
  }, [load, notify]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const images = Array.from(files).filter((x) => x.type.startsWith('image/'));
    if (!images.length) {
      notify('Please select valid image files (JPG, PNG, WebP).', true);
      return;
    }
    setBusy(true);
    try {
      const { identityId } = await fetchAuthSession();
      for (const f of images) {
        const path = `photos/${identityId}/${Date.now()}-${f.name}`;
        await uploadData({ path, data: f, options: { contentType: f.type } }).result;
        await client.models.Photo.create({
          title: f.name.replace(/\.[^.]+$/, ''),
          s3Key: path,
        });
      }
      await load();
      notify(`Uploaded ${images.length} ${images.length === 1 ? 'photo' : 'photos'} to S3.`);
    } catch (err) {
      console.error(err);
      notify('Upload failed. Check console for details.', true);
    } finally {
      setBusy(false);
    }
  }

  async function del(p: Photo) {
    if (deletingId) return;
    setDeletingId(p.id);
    try {
      await remove({ path: p.s3Key });
      await client.models.Photo.delete({ id: p.id });
      if (open?.id === p.id) setOpen(null);
      await load();
      notify(`Deleted "${p.title}".`);
    } catch (err) {
      console.error(err);
      notify('Could not delete photo.', true);
    } finally {
      setDeletingId(null);
    }
  }

  const mineCount = useMemo(() => photos.filter((p) => isMine(p)).length, [photos, isMine]);

  const visiblePhotos = useMemo(() => {
    return photos.filter((p) => {
      if (filter === 'mine' && !isMine(p)) return false;
      if (query.trim() && !p.title.toLowerCase().includes(query.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [photos, filter, isMine, query]);

  return (
    <>
      <nav>
        <div className="logo">
          <span className="dot" /> CloudGallery
        </div>
        <div className="who">
          <span className={`badge ${isAdmin ? 'admin' : ''}`}>{displayRole}</span>
          {me.email && <span className="mail">{me.email}</span>}
          <button className="btn ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </nav>

      <main>
        <section className="stats">
          <div className="stat-card">
            <div className="stat-label">
              <span>Photos in gallery</span>
              <span>S3 + AppSync</span>
            </div>
            <b>{photos.length}</b>
            <span className="stat-sub">Shared across authenticated members</span>
          </div>

          <div className="stat-card">
            <div className="stat-label">
              <span>Uploaded by you</span>
              <span>Owner Scope</span>
            </div>
            <b>{mineCount}</b>
            <span className="stat-sub">Full write &amp; delete permissions</span>
          </div>

          <div className="stat-card">
            <div className="stat-label">
              <span>Your role</span>
              <span>Cognito RBAC</span>
            </div>
            <b>{isAdmin ? 'Admin' : 'Member'}</b>
            <span className="stat-sub">
              {isAdmin ? 'Can moderate & delete all uploads' : 'Can view all & manage own uploads'}
            </span>
          </div>
        </section>

        <label
          className={`drop ${drag ? 'on' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            upload(e.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="plus">{busy ? <i className="spin" /> : '+'}</div>
          <strong>
            {busy ? 'Uploading to Amazon S3...' : 'Drop pictures here or click to browse'}
          </strong>
          <small>JPG, PNG, WebP &middot; Encrypted in Amazon S3 with DynamoDB metadata</small>
        </label>

        <div className="toolbar">
          <div className="tabs">
            <button
              type="button"
              className={`tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All Photos <span className="tab-count">{photos.length}</span>
            </button>
            <button
              type="button"
              className={`tab ${filter === 'mine' ? 'active' : ''}`}
              onClick={() => setFilter('mine')}
            >
              My Uploads <span className="tab-count">{mineCount}</span>
            </button>
          </div>

          <div className="search-box">
            <input
              type="search"
              placeholder="Search photos by title..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {visiblePhotos.length === 0 ? (
          <div className="empty">
            {photos.length === 0
              ? 'No photos yet. Drop an image above to be the first to upload.'
              : 'No photos match your current filter.'}
          </div>
        ) : (
          <section className="grid">
            {visiblePhotos.map((p) => {
              const owned = isMine(p);
              const deletable = canDelete(p);
              return (
                <figure key={p.id} onClick={() => setOpen(p)}>
                  <div className="card-top">
                    {owned ? <span className="owner-tag">Yours</span> : <span />}
                    {deletable && (
                      <button
                        type="button"
                        className="card-del"
                        title="Delete photo"
                        disabled={deletingId === p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          del(p);
                        }}
                      >
                        {deletingId === p.id ? '...' : '✕'}
                      </button>
                    )}
                  </div>
                  <img src={p.url} alt={p.title} loading="lazy" />
                  <figcaption>
                    <span className="cap-title">{p.title}</span>
                    <span className="cap-date">{formatDate(p.createdAt)}</span>
                  </figcaption>
                </figure>
              );
            })}
          </section>
        )}
      </main>

      {open && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <div className="lightbox-box" onClick={(e) => e.stopPropagation()}>
            <img src={open.url} alt={open.title} />
            <div className="bar">
              <div className="bar-meta">
                <strong>{open.title}</strong>
                <span>
                  Uploaded {formatDate(open.createdAt)}
                  {isMine(open) ? ' · Uploaded by you' : ''}
                </span>
              </div>
              {canDelete(open) && (
                <button
                  className="btn danger"
                  disabled={deletingId === open.id}
                  onClick={() => del(open)}
                >
                  {deletingId === open.id ? 'Deleting...' : 'Delete Photo'}
                </button>
              )}
              <button className="btn ghost" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.text}</div>}
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    const check = () =>
      getCurrentUser()
        .then((u) => setUser({ userId: u.userId, username: u.username }))
        .catch(() => setUser(null));
    check();
    return Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedOut') setUser(null);
      else if (payload.event === 'signedIn' || payload.event === 'signInWithRedirect') check();
    });
  }, []);

  if (user === undefined) {
    return (
      <div className="center">
        <i className="spin" />
      </div>
    );
  }

  return user ? <Dashboard user={user} /> : <Landing />;
}
