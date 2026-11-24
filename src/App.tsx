import { useCallback, useEffect, useState } from 'react';
import { Hub } from 'aws-amplify/utils';
import { getCurrentUser, fetchAuthSession, signInWithRedirect, signOut } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { get } from 'aws-amplify/api';
import { uploadData, getUrl, remove } from 'aws-amplify/storage';
import type { Schema } from '../amplify/data/resource';

const client = generateClient<Schema>();
type Photo = Schema['Photo']['type'] & { url?: string };
type Me = { email?: string; groups?: string[] };

function Landing() {
  return (
    <div className="landing">
      <div className="glow" />
      <span className="pill">Serverless · AWS Amplify</span>
      <h1>
        Your moments,
        <br />
        <span className="grad">beautifully shared.</span>
      </h1>
      <p>A private-by-default photo gallery. Sign in once, upload in seconds, browse everything.</p>
      <button className="btn big" onClick={() => signInWithRedirect({ provider: 'Google' })}>
        <svg width="18" height="18" viewBox="0 0 48 48">
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
    </div>
  );
}

function Dashboard({ uid }: { uid: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [me, setMe] = useState<Me>({});
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [open, setOpen] = useState<Photo | null>(null);
  const isAdmin = me.groups?.includes('Admins');

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
    load().catch(console.error);
    (async () => {
      const token = (await fetchAuthSession()).tokens?.idToken?.toString() ?? '';
      const res = await get({
        apiName: 'cloudgalleryRest',
        path: 'whoami',
        options: { headers: { Authorization: token } },
      }).response;
      setMe((await res.body.json()) as Me);
    })().catch(console.error);
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const { identityId } = await fetchAuthSession();
      for (const f of Array.from(files).filter((x) => x.type.startsWith('image/'))) {
        const path = `photos/${identityId}/${Date.now()}-${f.name}`;
        await uploadData({ path, data: f, options: { contentType: f.type } }).result;
        await client.models.Photo.create({ title: f.name.replace(/\.[^.]+$/, ''), s3Key: path });
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function del(p: Photo) {
    await remove({ path: p.s3Key });
    await client.models.Photo.delete({ id: p.id });
    setOpen(null);
    await load();
  }

  const mine = photos.filter((p) => p.owner?.startsWith(uid)).length;
  const canDelete = (p: Photo) => isAdmin || p.owner?.startsWith(uid);

  return (
    <>
      <nav>
        <div className="logo">
          <span className="dot" /> CloudGallery
        </div>
        <div className="who">
          <span className={`badge ${isAdmin ? 'admin' : ''}`}>{me.groups?.[0] ?? '…'}</span>
          <span className="mail">{me.email}</span>
          <button className="btn ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </nav>
      <main>
        <section className="stats">
          <div>
            <b>{photos.length}</b>
            <span>Photos in gallery</span>
          </div>
          <div>
            <b>{mine}</b>
            <span>Uploaded by you</span>
          </div>
          <div>
            <b>{isAdmin ? 'Admin' : 'Member'}</b>
            <span>Your role</span>
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
            onChange={(e) => upload(e.target.files)}
          />
          <div className="plus">{busy ? <i className="spin" /> : '+'}</div>
          <strong>{busy ? 'Uploading…' : 'Drop pictures here or click to browse'}</strong>
          <small>JPG, PNG, WebP · stored securely in Amazon S3</small>
        </label>
        {photos.length === 0 ? (
          <p className="empty">No photos yet. Be the first to upload.</p>
        ) : (
          <section className="grid">
            {photos.map((p) => (
              <figure key={p.id} onClick={() => setOpen(p)}>
                <img src={p.url} alt={p.title} loading="lazy" />
                <figcaption>{p.title}</figcaption>
              </figure>
            ))}
          </section>
        )}
      </main>
      {open && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <img src={open.url} alt={open.title} />
            <div className="bar">
              <strong>{open.title}</strong>
              {canDelete(open) && (
                <button className="btn danger" onClick={() => del(open)}>
                  Delete
                </button>
              )}
              <button className="btn ghost" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const check = () =>
      getCurrentUser()
        .then((u) => setUid(u.userId))
        .catch(() => setUid(null));
    check();
    return Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedOut') setUid(null);
      else if (payload.event === 'signedIn' || payload.event === 'signInWithRedirect') check();
    });
  }, []);
  if (uid === undefined)
    return (
      <div className="center">
        <i className="spin" />
      </div>
    );
  return uid ? <Dashboard uid={uid} /> : <Landing />;
}
