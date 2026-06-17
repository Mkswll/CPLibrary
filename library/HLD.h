/*

Mkswll's HLD class

Usage:
- import LazySegTree first

*/
template <typename T>
struct HLD {
	int n;
	Tree *t;
	LazySegTree<T> seg;
	vector<int> nid, hc, top, sub, par, dep;
	int tot = 0;
	
	HLD() {}
	HLD(Tree &_t): n{_t.n}, t{&_t}, seg(n), nid(n + 1), hc(n + 1, -1), top(n + 1, -1), sub(n + 1), par(n + 1, -1), dep(n + 1) {}
	
	void dfs1(int cur) {
		int mx = 0;
		sub[cur] = 1;
		for (int to : t->next(cur)) {
			if (to == par[cur]) continue;
			par[to] = cur;
			dep[to] = dep[cur] + 1;
			dfs1(to);
			sub[cur] += sub[to];
			if (sub[to] > mx) {
				mx = sub[to];
				hc[cur] = to;
			}
		}
	}
	
	void dfs2(int cur, int ctop) {
		nid[cur] = ++tot;
		top[cur] = ctop;
		
		if (hc[cur] != -1) {
			dfs2(hc[cur], ctop);
		}
		
		for (int to : t->next(cur)) {
			if (to == par[cur] || to == hc[cur]) continue;
			dfs2(to, to);
		}
	}
	
	void build() {
		tot = 0;
		dfs1(t->rt);
		dfs2(t->rt, t->rt);
	}
	
	template <typename T2>
	void update(int u, int v, const T2 &val) {
		while (top[u] != top[v]) {
			if (dep[top[u]] < dep[top[v]]) swap(u, v);
			seg.update(nid[top[u]], nid[u], val);
			u = par[top[u]];
		}
		
		if (dep[u] > dep[v]) swap(u, v);
		seg.update(nid[u], nid[v], val);
	}
	
	template <typename T2>
	void update(int u, const T2 &val) {
		seg.update(nid[u], nid[u] + sub[u] - 1, val);
	}
	
	T query(int u, int v) {
		T ret{};
		while (top[u] != top[v]) {
			if (dep[top[u]] < dep[top[v]]) swap(u, v);
			ret = ret + seg.query(nid[top[u]], nid[u]);
			u = par[top[u]];
		}
		
		if (dep[u] > dep[v]) swap(u, v);
		ret = ret + seg.query(nid[u], nid[v]);
		return ret;
	}
	
	T query(int u) {
		return seg.query(nid[u], nid[u] + sub[u] - 1);
	}
	
};
