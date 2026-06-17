/*

Mkswll's Graph and Tree classes

*/
struct Graph {
	int n;
	vector<vector<int>> adj;
	
	Graph() {}
	Graph(int n_): n{n_}, adj(n_ + 1) {};
	
	vector<int> &operator [](int u) { return adj[u]; }
	const vector<int> &operator [](int u) const { return adj[u]; }
	
	void add(int u, int v) { adj[u].push_back(v); }
};

struct Tree : public Graph {
	int rt;
	
	Tree(int n_, int rt_ = 1): Graph{n_}, rt{rt_} {}
};
