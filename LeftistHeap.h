#define LH LeftistHeap
/*

Mkswll's LeftistHeap class

*/
template <typename T, typename Comp = less<T>>
struct LeftistHeap {
	int n;
	Comp cmp;
	
	T INVALID; // change invalid value here
	
	struct Node {
		T key;
		int lc = 0, rc = 0;
		int rt = 0, dis = -1;
		bool alive = 1;
	};
	
	vector<Node> t;
	
	LeftistHeap(int _n, T _INVALID): n{_n}, INVALID{_INVALID} {
		t.assign(_n + 1, {});
	}
	
	void make_tree(int id, T key) {
		t[id] = {
			.key = key,
			.rt = id,
			.dis = 0,
			.alive = 1,
		};
	}
	
	int find(int x) { // assuming x is alive
		return x == t[x].rt ? x : t[x].rt = find(t[x].rt);
	}
	
	int merge(int l, int r) {
		if (!l || !r) return l + r;
		if (l == r) return l;
		if (cmp(t[l].key, t[r].key)) swap(l, r);
		t[r].rt = t[l].rt;
		t[l].rc = merge(t[l].rc, r);
		if (t[t[l].lc].dis < t[t[l].rc].dis) swap(t[l].lc, t[l].rc);
		t[l].dis = t[t[l].rc].dis + 1;
		return l;
	}
	
	int merge_trees(int l, int r) {
		if (!t[l].alive || !t[r].alive) return 0;
		l = find(l);
		r = find(r);
		return merge(l, r);
	}
	
	T top(int x) {
		if (!t[x].alive) return INVALID;
		x = find(x);
		return t[x].key;
	}
	
	void pop(int x) {
		if (!t[x].alive) return;
		x = find(x);
		int res = merge(t[x].lc, t[x].rc);
		t[x].rt = t[res].rt = res;
		t[x].lc = t[x].rc = t[x].dis = t[x].alive = 0;
		return;
	}
};
