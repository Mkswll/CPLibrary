/*

Mkswll's LazySegTree class, under construction

*/
template <typename T, typename Tag>
struct LazySegTree {
	int n;
	vector<T> info;
	vector<T> t;
	vector<Tag> tag;
	
	// change the zero values here
	T t_zero = 0;
	Tag tag_zero = 0; 
	
	void resize(int n_){
		info.assign(n_ + 1, t_zero);
		t.assign((n_ + 1) << 2, t_zero);
		tag.assign((n_ + 1) << 2, tag_zero);
	}
	
	LazySegTree(): n(0) {}
	
	LazySegTree(int n_): n(n_) {
		resize(n_);
	}
	
	template <typename T2>
	LazySegTree(int n_, T2& info_){
		init(n_, info_);
	}
	
	template <typename T2>
	void init(int n_, T2& info_){
		n = n_;
		resize(n_);
		for(int i = 1; i <= n; ++i){
			info[i] = info_[i];
		}
	}
	
	void push_up(int cur, int l, int r){
		t[cur] = operate(t[cur << 1], t[cur << 1 | 1]);
	}
	
	void push_down(int cur, int l, int r){
		int mid = (l + r) >> 1;
		apply(cur << 1, l, mid, tag[cur]);
		apply(cur << 1 | 1, mid + 1, r, tag[cur]);
		tag[cur] = tag_zero;
	}
	
	void build(){
		build(1, 1, n);
	}
	
	void update(int l, int r, T val){
		update(1, 1, n, l, r, val);
	}
	
	T query(int l, int r){
		return query(1, 1, n, l, r);
	}
	
	void build(int cur, int l, int r){
		if(l == r){
			t[cur] = info[l];
			return;
		}
		int mid = (l + r) >> 1;
		build(cur << 1, l, mid);
		build(cur << 1 | 1, mid + 1, r);
		push_up(cur, l, r);
	}
	
	void update(int cur, int l, int r, int ql, int qr, T val){
		if(l > qr || r < ql){
			return;
		}
		if(l >= ql && r <= qr){
			apply(cur, l, r, val);
			return;
		}
		push_down(cur, l, r);
		int mid = (l + r) >> 1;
		update(cur << 1, l, mid, ql, qr, val);
		update(cur << 1 | 1, mid + 1, r, ql, qr, val);
		push_up(cur, l, r);
	}
	
	T query(int cur, int l, int r, int ql, int qr){
		if(l > qr || r < ql){
			return t_zero;
		}
		if(l >= ql && r <= qr){
			return t[cur];
		}
		push_down(cur, l, r);
		int mid = (l + r) >> 1;
		return operate(query(cur << 1, l, mid, ql, qr), query(cur << 1 | 1, mid + 1, r, ql, qr));
	}
	
	
	T operate(T x, T y){ // change the seg tree operation here
		return x + y;
	}
	
	void apply(int cur, int l, int r, Tag tag_){ // change the apply tag operation here
		t[cur] += tag_ * (r - l + 1);
		tag[cur] += tag_;
	}
};
